import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DataToolsController } from './data-tools.controller';
import { DataToolsService } from './data-tools.service';

@Module({
  imports: [StorageModule],
  controllers: [DataToolsController],
  providers: [DataToolsService],
})
export class DataToolsModule {}
