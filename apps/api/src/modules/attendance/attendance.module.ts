import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { LinkTokenService } from './link-token.service';
import { AttendanceReminderSweeper } from './reminder.sweeper';

// The sweeper runs in the worker only, like the outbox sweep.
const role = process.env.ROLE ?? 'all';
const workerOnly = role === 'api' ? [] : [AttendanceReminderSweeper];

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, LinkTokenService, ...workerOnly],
  exports: [AttendanceService, LinkTokenService],
})
export class AttendanceModule {}
