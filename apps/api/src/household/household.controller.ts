import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';
import { AcceptHouseholdInviteDto, HouseholdNameDto } from './dto/household.dto';
import { HouseholdService } from './household.service';
import { FamilyPersonalizationService } from './family-personalization.service';

@ApiTags('Household')
@ApiSessionProtected()
@UseGuards(SessionAuthGuard)
@Controller('me/household')
export class HouseholdController {
  constructor(
    private readonly households: HouseholdService,
    private readonly personalization: FamilyPersonalizationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create the current user household.' })
  @ApiResponse({ status: 201, description: 'Household created.' })
  @ApiStandardErrors(400, 401, 409)
  create(@CurrentUser() identity: AuthenticatedIdentity, @Body() dto: HouseholdNameDto) {
    return this.households.create(identity.userId, dto.name);
  }

  @Get()
  @ApiOperation({ summary: 'Read the current user household and active members.' })
  @ApiResponse({ status: 200, description: 'Household view.' })
  @ApiStandardErrors(401, 404)
  get(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.households.get(identity.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Rename a household as its owner.' })
  @ApiResponse({ status: 200, description: 'Renamed household.' })
  @ApiStandardErrors(400, 401, 403, 404)
  rename(@CurrentUser() identity: AuthenticatedIdentity, @Body() dto: HouseholdNameDto) {
    return this.households.rename(identity.userId, dto.name);
  }

  @Post('invites')
  @ApiOperation({ summary: 'Create a one-time household invitation as owner.' })
  @ApiResponse({ status: 201, description: 'Raw token and join URL returned once.' })
  @ApiStandardErrors(401, 403, 404)
  invite(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.households.createInvite(identity.userId);
  }

  @Delete('members/:memberId')
  @ApiOperation({ summary: 'Remove another household member as owner.' })
  @ApiParam({ name: 'memberId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Updated household.' })
  @ApiStandardErrors(400, 401, 403, 404)
  remove(@CurrentUser() identity: AuthenticatedIdentity, @Param('memberId') memberId: string) {
    return this.households.removeMember(identity.userId, memberId);
  }

  @Post('leave')
  @ApiOperation({ summary: 'Leave a household as a normal member.' })
  @ApiResponse({ status: 201, description: 'Membership removed.' })
  @ApiStandardErrors(401, 404, 409)
  leave(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.households.leave(identity.userId);
  }

  @Get('taste-profile')
  @ApiOperation({ summary: 'Get deterministic aggregate Family Taste.' })
  @ApiResponse({ status: 200, description: 'Aggregate only; private member evidence is omitted.' })
  @ApiStandardErrors(401, 404)
  taste(@CurrentUser() identity: AuthenticatedIdentity) {
    return this.households.tasteProfile(identity.userId);
  }

  @Post('recipes/:slug/personalized-versions')
  @ApiOperation({ summary: 'Generate or reuse an immutable Family Taste recipe version.' })
  @ApiResponse({ status: 201, description: 'Household personalized version.' })
  @ApiStandardErrors(401, 404, 409)
  personalize(@CurrentUser() identity: AuthenticatedIdentity, @Param('slug') slug: string) {
    return this.personalization.create(identity.userId, slug);
  }

  @Get('recipes/:slug/personalized-versions/latest')
  @ApiOperation({ summary: 'Get the latest household personalized recipe version.' })
  @ApiResponse({ status: 200, description: 'Latest household personalized version.' })
  @ApiStandardErrors(401, 404)
  latest(@CurrentUser() identity: AuthenticatedIdentity, @Param('slug') slug: string) {
    return this.personalization.latest(identity.userId, slug);
  }
}

@ApiTags('Household')
@ApiSessionProtected()
@UseGuards(SessionAuthGuard)
@Controller('household-invites')
export class HouseholdInviteController {
  constructor(private readonly households: HouseholdService) {}

  @Post('accept')
  @ApiOperation({ summary: 'Accept an authenticated one-time household invitation.' })
  @ApiResponse({ status: 201, description: 'Joined household.' })
  @ApiStandardErrors(400, 401, 409)
  accept(@CurrentUser() identity: AuthenticatedIdentity, @Body() dto: AcceptHouseholdInviteDto) {
    return this.households.acceptInvite(identity.userId, dto.token);
  }
}
