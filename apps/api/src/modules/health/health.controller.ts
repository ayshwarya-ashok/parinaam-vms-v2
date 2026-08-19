import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RedisHealthIndicator } from './redis.health';
import { N8nHealthIndicator } from './n8n.health';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly n8n: N8nHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — is the process up?' })
  liveness(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness — database, Redis and n8n reachable?' })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.redis.isHealthy('redis'),
      () => this.n8n.isHealthy('n8n'),
    ]);
  }
}
