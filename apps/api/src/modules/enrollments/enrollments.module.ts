import { Module } from '@nestjs/common';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { EventsBrowseService } from './events-browse.service';

@Module({
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EventsBrowseService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}
