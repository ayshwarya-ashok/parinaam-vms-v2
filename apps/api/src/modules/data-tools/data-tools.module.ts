import { Module } from '@nestjs/common';
import { CertificatePdfService } from '../certificates/certificate-pdf.service';
import { StorageModule } from '../storage/storage.module';
import { DataToolsController } from './data-tools.controller';
import { DataToolsService } from './data-tools.service';

@Module({
  imports: [StorageModule],
  controllers: [DataToolsController],
  // The PDF renderer is stateless — provided here directly so the seeder can
  // issue real certificate files without circular module wiring.
  providers: [DataToolsService, CertificatePdfService],
})
export class DataToolsModule {}
