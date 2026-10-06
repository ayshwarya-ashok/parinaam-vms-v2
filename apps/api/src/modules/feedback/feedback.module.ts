import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EventPhoto,
  FeedbackImprovement,
  FeedbackIssue,
  FeedbackOption,
  FeedbackSubmission,
  Volunteer,
} from '../../database/entities';
import { AttendanceModule } from '../attendance/attendance.module';
import { PublicModule } from '../public/public.module';
import { StorageModule } from '../storage/storage.module';
import { FeedbackRequestSweeper } from './feedback-request.sweeper';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

// The sweeper runs in the worker only, like the outbox sweep.
const role = process.env.ROLE ?? 'all';
const workerOnly = role === 'api' ? [] : [FeedbackRequestSweeper];

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedbackSubmission,
      FeedbackIssue,
      FeedbackImprovement,
      FeedbackOption,
      Volunteer,
      EventPhoto,
    ]),
    // LinkTokenService (the signed-link machinery) lives in the attendance
    // module — Round 51 reuses it for login-free feedback.
    AttendanceModule,
    StorageModule,
    // Publishing a testimonial busts the public page's 5-minute cache.
    PublicModule,
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService, ...workerOnly],
  exports: [FeedbackService],
})
export class FeedbackModule {}
