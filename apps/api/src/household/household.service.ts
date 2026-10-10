import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { aggregateFamilyTaste, type FamilyTasteInput, type TasteDimensionKey } from '@bep-nho/domain';
import { PrismaService } from '../database/prisma.service';
import { HouseholdLockService } from '../database/household-lock.service';
import { createOpaqueToken, hashOpaqueToken } from '../auth/opaque-token';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MEMBERS = 8;
const TASTE_VERSION = 'taste-v1';

@Injectable()
export class HouseholdService {
  private readonly logger = new Logger(HouseholdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly householdLock: HouseholdLockService,
  ) {}

  private async membership(userId: string) {
    return this.prisma.householdMember.findUnique({
      where: { userId },
      include: { household: true },
    });
  }

  async create(userId: string, rawName: string) {
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Household name is required.');
    try {
      const household = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.householdMember.findUnique({ where: { userId } });
        if (existing) throw new ConflictException('Current user already belongs to a household.');
        return tx.household.create({
          data: { name, members: { create: { userId, role: 'owner' } } },
        });
      });
      this.logger.log('Household event: household created');
      return this.get(userId, household.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Current user already belongs to a household.');
      }
      throw error;
    }
  }

  async get(userId: string, expectedHouseholdId?: string) {
    const member = await this.prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: {
          include: {
            members: {
              orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
              include: { user: { include: { credential: true } } },
            },
          },
        },
      },
    });
    if (!member || member.household.status !== 'active' || (expectedHouseholdId && member.householdId !== expectedHouseholdId)) {
      throw new NotFoundException('Household was not found.');
    }
    return {
      data: {
        id: member.household.id,
        name: member.household.name,
        status: member.household.status,
        role: member.role,
        members: member.household.members.map((item) => ({
          id: item.id,
          role: item.role,
          joinedAt: item.joinedAt,
          displayIdentifier: item.user.credential?.normalizedEmail ?? item.userId,
          current: item.userId === userId,
        })),
      },
    };
  }

  async rename(userId: string, rawName: string) {
    const name = rawName.trim();
    if (!name) throw new BadRequestException('Household name is required.');
    const member = await this.membership(userId);
    if (!member || member.household.status !== 'active') throw new NotFoundException('Household was not found.');
    if (member.role !== 'owner') throw new ForbiddenException('Only the household owner may rename it.');
    await this.prisma.household.update({ where: { id: member.householdId }, data: { name } });
    return this.get(userId);
  }

  async createInvite(userId: string) {
    const member = await this.membership(userId);
    if (!member || member.household.status !== 'active') throw new NotFoundException('Household was not found.');
    if (member.role !== 'owner') throw new ForbiddenException('Only the household owner may create invitations.');
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.householdInvite.create({
      data: {
        householdId: member.householdId,
        tokenHash: token.hash,
        expiresAt,
        createdByUserId: userId,
      },
    });
    this.logger.log('Household event: invitation created');
    return { data: { token: token.raw, expiresAt, joinUrl: `/household/join?token=${encodeURIComponent(token.raw)}` } };
  }

  async acceptInvite(userId: string, rawToken: string) {
    const tokenHash = hashOpaqueToken(rawToken);
    const discovered = await this.prisma.householdInvite.findUnique({
      where: { tokenHash },
      select: { id: true, householdId: true },
    });
    if (!discovered) throw new BadRequestException('Invalid or expired household invitation.');
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.householdLock.acquire(tx, discovered.householdId, 'invite_accept');
        const [invite, existing, count] = await Promise.all([
          tx.householdInvite.findUnique({ where: { id: discovered.id }, include: { household: true } }),
          tx.householdMember.findUnique({ where: { userId } }),
          tx.householdMember.count({ where: { householdId: discovered.householdId } }),
        ]);
        const now = new Date();
        if (!invite || invite.tokenHash !== tokenHash || invite.usedAt || invite.expiresAt <= now || invite.household.status !== 'active') {
          throw new BadRequestException('Invalid or expired household invitation.');
        }
        if (existing) throw new ConflictException('Current user already belongs to a household.');
        if (count >= MAX_MEMBERS) throw new ConflictException('Household already has the maximum of 8 members.');
        const consumed = await tx.householdInvite.updateMany({
          where: { id: invite.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw new BadRequestException('Invalid or expired household invitation.');
        await tx.householdMember.create({ data: { householdId: invite.householdId, userId, role: 'member' } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Current user already belongs to a household.');
      }
      throw error;
    }
    this.logger.log('Household event: invitation accepted');
    return this.get(userId, discovered.householdId);
  }

  async removeMember(userId: string, memberId: string) {
    const actor = await this.membership(userId);
    if (!actor || actor.household.status !== 'active') throw new NotFoundException('Household was not found.');
    if (actor.role !== 'owner') throw new ForbiddenException('Only the household owner may remove members.');
    if (actor.id === memberId) throw new BadRequestException('The owner cannot remove themselves.');
    await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, actor.householdId, 'member_remove');
      const target = await tx.householdMember.findFirst({ where: { id: memberId, householdId: actor.householdId } });
      if (!target) throw new NotFoundException('Household member was not found.');
      if (target.role === 'owner') throw new BadRequestException('The owner cannot remove themselves.');
      await tx.householdMember.delete({ where: { id: target.id } });
    });
    this.logger.log('Household event: member removed');
    return this.get(userId);
  }

  async leave(userId: string) {
    const member = await this.membership(userId);
    if (!member || member.household.status !== 'active') throw new NotFoundException('Household was not found.');
    if (member.role === 'owner') throw new ConflictException('The household owner cannot leave.');
    await this.prisma.$transaction(async (tx) => {
      await this.householdLock.acquire(tx, member.householdId, 'member_leave');
      await tx.householdMember.deleteMany({ where: { id: member.id, userId, role: 'member' } });
    });
    this.logger.log('Household event: member left');
    return { data: { left: true } };
  }

  async tasteProfile(userId: string) {
    const member = await this.membership(userId);
    if (!member || member.household.status !== 'active') throw new NotFoundException('Household was not found.');
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: member.householdId },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: {
        user: {
          include: {
            tasteProfiles: {
              where: { algorithmVersion: TASTE_VERSION },
              include: { dimensions: { where: { scopeType: 'global', scopeId: '' } } },
            },
          },
        },
      },
    });
    const inputs: FamilyTasteInput[] = members.flatMap((householdMember) =>
      (householdMember.user.tasteProfiles[0]?.dimensions ?? []).map((dimension) => ({
        dimensionKey: dimension.dimensionKey as TasteDimensionKey,
        score: Number(dimension.score),
        confidence: Number(dimension.confidence),
        manualOverride: dimension.manualOverride === null ? null : Number(dimension.manualOverride),
      })),
    );
    return {
      data: {
        householdId: member.householdId,
        algorithmVersion: 'family-taste-v1',
        dimensions: aggregateFamilyTaste(members.length, inputs),
      },
    };
  }
}
