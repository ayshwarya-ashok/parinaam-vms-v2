import { Controller, Get, NotFoundException, Query, Res, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { basename, extname } from 'node:path';
import { Public } from '../../common/decorators/auth.decorators';
import { SignedUrlService } from './signed-url.service';
import { StorageService } from './storage.service';

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * Signed file delivery — the ONLY unauthenticated way a stored file leaves the
 * system. The signature covers the exact path and expiry; a traversal attempt
 * changes the path and therefore breaks the signature before it is ever
 * resolved against the disk.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly signer: SignedUrlService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('signed')
  @ApiOperation({ summary: 'Fetch a file with a signed, expiring URL (used by n8n for attachments)' })
  async signed(
    @Query('path') path: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
    @Query('name') name?: string,
  ): Promise<void> {
    if (!this.signer.verify(path, Number(exp) || 0, sig ?? '')) {
      throw new UnauthorizedException('Invalid or expired file signature');
    }

    let data: Buffer;
    try {
      data = await this.storage.get(path);
    } catch {
      throw new NotFoundException('File not found');
    }

    // Display name only — sanitised to a basename so it can't smuggle paths.
    const filename = basename(name || basename(path)).replace(/["\\]/g, '');
    res
      .type(CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(data);
  }
}
