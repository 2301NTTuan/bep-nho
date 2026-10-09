import { createHash, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: config.get<string>('S3_REGION', 'us-east-1'),
      forcePathStyle: config.get<boolean>('S3_FORCE_PATH_STYLE', true),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_KEY'),
      },
    });
  }

  async upload(userId: string, file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) throw new UnprocessableEntityException('One image file is required.');
    if (file.buffer.length > MAX_MEDIA_BYTES) throw new UnprocessableEntityException('Image exceeds the 8 MB limit.');

    let normalized: Buffer;
    let width: number | null = null;
    let height: number | null = null;
    try {
      const image = sharp(file.buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
        throw new UnprocessableEntityException('Only valid JPEG, PNG, or WebP images are accepted.');
      }
      const result = await image.rotate().webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
      normalized = result.data;
      width = result.info.width;
      height = result.info.height;
    } catch (error) {
      if (error instanceof UnprocessableEntityException) throw error;
      throw new UnprocessableEntityException('Image bytes could not be decoded safely.');
    }

    const id = randomUUID();
    const objectKey = `recipe-media/${id}.webp`;
    const sha256 = createHash('sha256').update(normalized).digest('hex');
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: normalized,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
        Metadata: { sha256 },
      }));
    } catch {
      throw new ServiceUnavailableException('Media storage is temporarily unavailable.');
    }

    try {
      const asset = await this.prisma.mediaAsset.create({
        data: {
          id,
          objectKey,
          sha256,
          mimeType: 'image/webp',
          byteSize: normalized.length,
          width,
          height,
          createdByUserId: userId,
        },
      });
      this.logger.log('Editorial event: media uploaded');
      return { data: this.serialize(asset) };
    } catch (error) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey })).catch(() => undefined);
      throw error;
    }
  }

  async list() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return { data: assets.map((asset) => this.serialize(asset)) };
  }

  async remove(mediaId: string) {
    const asset = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string;
        objectKey: string;
      }>>`
        SELECT "id", "object_key" AS "objectKey"
        FROM "media_assets"
        WHERE "id" = ${mediaId}::uuid
          AND "status" = 'active'
        FOR UPDATE
      `;
      const locked = rows[0];
      if (!locked) throw new NotFoundException('Media asset was not found.');
      const [publishedReferences, draftReferences] = await Promise.all([
        tx.recipeVersion.count({ where: { heroMediaAssetId: mediaId } }),
        tx.recipeDraft.count({
          where: { status: 'draft', contentJson: { path: ['heroMediaAssetId'], equals: mediaId } },
        }),
      ]);
      if (publishedReferences > 0) throw new ConflictException('Published recipe media cannot be deleted.');
      if (draftReferences > 0) throw new ConflictException('Detach this media from editable drafts before deletion.');
      await tx.mediaAsset.update({ where: { id: mediaId }, data: { status: 'deleted' } });
      return locked;
    });
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: asset.objectKey }));
    } catch {
      await this.prisma.mediaAsset.updateMany({
        where: { id: mediaId, status: 'deleted' }, data: { status: 'active' },
      });
      throw new ServiceUnavailableException('Media storage is temporarily unavailable.');
    }
    await this.prisma.mediaAsset.deleteMany({ where: { id: mediaId, status: 'deleted' } });
    this.logger.log('Editorial event: media deleted');
    return { data: { deleted: true } };
  }

  async read(mediaId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: mediaId, status: 'active' },
    });
    if (!asset) throw new NotFoundException('Media asset was not found.');
    try {
      const object = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: asset.objectKey,
      }));
      if (!object.Body) throw new Error('Object body missing');
      return {
        bytes: Buffer.from(await object.Body.transformToByteArray()),
        mimeType: asset.mimeType,
        sha256: asset.sha256,
      };
    } catch {
      throw new ServiceUnavailableException('Media storage is temporarily unavailable.');
    }
  }

  private serialize(asset: {
    id: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
    width: number | null;
    height: number | null;
    status: string;
    createdAt: Date;
  }) {
    return {
      id: asset.id,
      sha256: asset.sha256,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      width: asset.width,
      height: asset.height,
      status: asset.status,
      createdAt: asset.createdAt,
      url: `/v1/media/${asset.id}`,
    };
  }
}
