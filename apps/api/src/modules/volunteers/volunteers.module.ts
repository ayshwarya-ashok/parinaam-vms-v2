import { Module } from '@nestjs/common';
// Provided locally rather than importing AuthModule: AuthModule imports THIS
// module (registration needs the atomic account+profile write), so importing
// it back would be circular. PasswordService is stateless.
import { PasswordService } from '../auth/password.service';
import { InactivitySweeper } from './inactivity.sweeper';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

// Sweeps run in the worker only, like the outbox/reminder/feedback sweeps.
const role = process.env.ROLE ?? 'all';
const workerOnly = role === 'api' ? [] : [InactivitySweeper];

@Module({
  controllers: [VolunteersController],
  providers: [VolunteersService, PasswordService, ...workerOnly],
  exports: [VolunteersService],
})
export class VolunteersModule {}
