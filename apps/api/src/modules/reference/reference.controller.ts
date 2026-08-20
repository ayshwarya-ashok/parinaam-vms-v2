import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/auth.decorators';
import { ReferenceValue } from '../../database/entities';

/**
 * The option lists the registration form renders from.
 *
 * Public because registration itself is public — the form must be able to show
 * "Which languages do you speak?" before anyone has an account. It exposes
 * nothing but admin-curated vocabulary.
 */
@ApiTags('reference')
@Controller('reference-values')
export class ReferenceController {
  constructor(
    @InjectRepository(ReferenceValue) private readonly values: Repository<ReferenceValue>,
  ) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  @ApiOperation({ summary: 'Active option lists grouped by category (LANGUAGE, AREA_OF_INTEREST, AVAILABILITY)' })
  async grouped(): Promise<Record<string, Array<{ code: string; label: string }>>> {
    const rows = await this.values.find({
      where: { isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC' },
    });

    const grouped: Record<string, Array<{ code: string; label: string }>> = {};
    for (const row of rows) {
      (grouped[row.category] ??= []).push({ code: row.code, label: row.label });
    }
    return grouped;
  }
}
