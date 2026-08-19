import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Certificate, Volunteer } from '../../database/entities';
import { CertificatePdfService } from './certificate-pdf.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  imports: [TypeOrmModule.forFeature([Certificate, Volunteer])],
  controllers: [CertificatesController],
  providers: [CertificatesService, CertificatePdfService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
