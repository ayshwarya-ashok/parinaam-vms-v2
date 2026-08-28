import { Module } from '@nestjs/common';
// Provided locally rather than importing AuthModule: AuthModule imports THIS
// module (registration needs the atomic account+profile write), so importing
// it back would be circular. PasswordService is stateless.
import { PasswordService } from '../auth/password.service';
import { VolunteersController } from './volunteers.controller';
import { VolunteersService } from './volunteers.service';

@Module({
  controllers: [VolunteersController],
  providers: [VolunteersService, PasswordService],
  exports: [VolunteersService],
})
export class VolunteersModule {}
