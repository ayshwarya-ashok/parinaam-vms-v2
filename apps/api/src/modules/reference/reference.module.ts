import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReferenceValue } from '../../database/entities';
import { ReferenceController } from './reference.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReferenceValue])],
  controllers: [ReferenceController],
})
export class ReferenceModule {}
