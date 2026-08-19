import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Training } from '../../database/entities';

/**
 * Read-only catalog listing — enough for the Phase 2 training-link pickers.
 * The full module (materials, quizzes, attempts, assessments) is Phase 4 and
 * grows in this folder.
 */
@ApiTags('trainings')
@Controller('trainings')
export class TrainingsController {
  constructor(
    @InjectRepository(Training) private readonly trainings: Repository<Training>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Training catalog (id, name, duration, mode, mandatory)' })
  list(@Query('category') category?: string, @Query('status') status?: string) {
    return this.trainings.find({
      where: {
        ...(category ? { category: category as Training['category'] } : {}),
        ...(status ? { status: status as Training['status'] } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        duration: true,
        mode: true,
        category: true,
        status: true,
        isMandatory: true,
        passingScore: true,
      },
      order: { isMandatory: 'DESC', name: 'ASC' },
    });
  }
}

@Module({ controllers: [TrainingsController] })
export class TrainingsModule {}
