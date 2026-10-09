import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaService } from './admin/media.service';
import { PrismaService } from './database/prisma.service';

describe('media storage failure boundary', () => {
  it('turns an S3 outage into a controlled 503', async () => {
    const prisma = {
      mediaAsset: {
        findFirst: jest.fn().mockResolvedValue({
          id: '00000000-0000-4000-8000-000000000001',
          objectKey: 'recipe-media/missing.webp',
          mimeType: 'image/webp',
          sha256: 'a'.repeat(64),
          status: 'active',
        }),
      },
    } as unknown as PrismaService;
    const config = new ConfigService({
      S3_BUCKET: 'unavailable-test-bucket',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: true,
      S3_ACCESS_KEY: 'test-access',
      S3_SECRET_KEY: 'test-secret',
    });
    const service = new MediaService(prisma, config);
    await expect(service.read('00000000-0000-4000-8000-000000000001'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
