import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { CoordinatorsController } from './coordinators.controller';
import { EventsAdminService } from './events-admin.service';
import { PhasesService } from './phases.service';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';

@Module({
  controllers: [ProgramsController, CoordinatorsController, AnalyticsController],
  providers: [ProgramsService, EventsAdminService, PhasesService],
  exports: [ProgramsService, EventsAdminService, PhasesService],
})
export class ProgramsModule {}
