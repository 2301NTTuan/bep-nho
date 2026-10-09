import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { AdminGuard } from './admin.guard';
import { MAX_MEDIA_BYTES, MediaService } from './media.service';
import { ApiSessionProtected } from '../openapi/decorators';

type BinaryResponse = {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
};

@ApiTags('Admin media')
@ApiSessionProtected()
@Controller('admin/media')
@UseGuards(SessionAuthGuard, AdminGuard)
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @ApiOperation({ summary: 'Upload and normalize recipe media (admin only).' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MEDIA_BYTES, files: 1, fields: 0 } }))
  upload(
    @CurrentUser() actor: AuthenticatedIdentity,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) { return this.media.upload(actor.userId, file); }

  @Get()
  list() { return this.media.list(); }

  @Delete(':mediaId')
  remove(@Param('mediaId', new ParseUUIDPipe()) mediaId: string) {
    return this.media.remove(mediaId);
  }
}

@ApiTags('Media')
@Controller('media')
export class PublicMediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':mediaId')
  @ApiOperation({ summary: 'Get immutable active recipe media.' })
  @ApiResponse({ status: 200, description: 'Normalized WebP image bytes.' })
  @ApiResponse({ status: 404, description: 'Active media asset not found.' })
  @ApiResponse({ status: 503, description: 'Object storage is unavailable.' })
  async get(
    @Param('mediaId', new ParseUUIDPipe()) mediaId: string,
    @Res() response: BinaryResponse,
  ) {
    const object = await this.media.read(mediaId);
    response.setHeader('Content-Type', object.mimeType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    response.setHeader('ETag', `"${object.sha256}"`);
    response.send(object.bytes);
  }
}
