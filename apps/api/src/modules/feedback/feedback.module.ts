import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FeedbackImprovement,
  FeedbackIssue,
  FeedbackOption,
  FeedbackSubmission,
  Volunteer,
} from '../../database/entities';
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
    ]),
  ],
  controllers: [FeedbackController],
  providers: [FeedbackService, ...workerOnly],
  exports: [FeedbackService],
})
export class FeedbackModule {}
