import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { SignedUrlService } from './signed-url.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, SignedUrlService],
  exports: [StorageService, SignedUrlService],
})
export class StorageModule {}
