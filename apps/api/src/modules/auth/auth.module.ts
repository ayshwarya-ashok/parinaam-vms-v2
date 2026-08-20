import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { VolunteersModule } from '../volunteers/volunteers.module';

@Module({
  // Secrets are passed per-call in AuthService/JwtAuthGuard, so the module
  // itself needs no configuration.
  // VolunteersModule owns the atomic account+profile write that registration needs.
  imports: [JwtModule.register({}), VolunteersModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [AuthService, PasswordService, JwtModule],
})
export class AuthModule {}
