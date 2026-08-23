import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Body, Controller, Get, Inject, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { MediaService } from './media.service.js';

const uploadTmp = path.resolve(process.env.MEDIA_LOCAL_ROOT || './.runtime/media', 'uploads');
fs.mkdirSync(uploadTmp, { recursive: true });

@Controller()
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post('voices/:voiceId/upload-policy')
  @UseGuards(AuthGuard)
  policy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Body() body: { fileName?: string; mimeType?: string; sizeBytes?: number },
  ) {
    return this.media.uploadPolicy(user.id, voiceId, body || {});
  }

  @Post('voices/:voiceId/media-upload')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: uploadTmp,
      filename: (_request, file, callback) => {
        callback(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname || '')}`);
      },
    }),
    limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.media.registerSourceVideo(user.id, voiceId, file);
  }

  @Post('voices/:voiceId/media')
  @UseGuards(AuthGuard)
  confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('voiceId') voiceId: string,
    @Body() body: {
      objectKey?: string;
      mediaId?: string;
      fileName?: string;
      mimeType?: string;
      sizeBytes?: number;
      durationMs?: number;
    },
  ) {
    return this.media.confirmSourceMedia(user.id, voiceId, body || {});
  }

  @Get('media/:mediaId/play')
  async play(
    @Param('mediaId') mediaId: string,
    @Query('userId') userId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() response: Response,
  ): Promise<void> {
    const asset = await this.media.resolveSigned(mediaId, userId, Number(exp), sig);
    if ('redirectUrl' in asset && asset.redirectUrl) {
      response.setHeader('Cache-Control', 'private, no-store');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.redirect(302, asset.redirectUrl);
      return;
    }
    if (!('filePath' in asset) || !asset.filePath) throw new Error('local media path is missing');
    response.type(asset.mimeType);
    response.setHeader('Content-Length', String(asset.bytes));
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(fs.createReadStream(asset.filePath), response);
  }
}
