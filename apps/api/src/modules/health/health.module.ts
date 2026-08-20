import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { N8nHealthIndicator } from './n8n.health';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, MetricsController],
  providers: [RedisHealthIndicator, N8nHealthIndicator],
})
export class HealthModule {}
