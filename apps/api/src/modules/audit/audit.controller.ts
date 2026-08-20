import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Roles } from '../../common/decorators/auth.decorators';
import { UUID_PATTERN } from '../../common/pipes/uuid.pipe';

/** The who-did-what trail: admin actions, consent signatures, erasures. */
@ApiTags('audit')
@Roles('admin')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOperation({ summary: 'Audit trail, newest first — filter by entity / entityId / actor / date range' })
  async list(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT id, actor_id, actor_email, action, entity, entity_id,
              before_data, after_data, ip_address, created_at
       FROM audit_logs
       WHERE ($1::text IS NULL OR entity = $1)
         AND ($2::uuid IS NULL OR entity_id = $2)
         AND ($3::uuid IS NULL OR actor_id = $3)
         AND ($4::timestamptz IS NULL OR created_at >= $4)
         AND ($5::timestamptz IS NULL OR created_at <= $5)
       ORDER BY created_at DESC
       LIMIT $6`,
      [
        entity || null,
        entityId && UUID_PATTERN.test(entityId) ? entityId : null,
        actorId && UUID_PATTERN.test(actorId) ? actorId : null,
        from || null,
        to || null,
        Math.min(Number(limit) || 100, 500),
      ],
    );
    return { data: rows };
  }
}
