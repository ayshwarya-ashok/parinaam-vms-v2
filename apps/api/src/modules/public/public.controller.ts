import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/auth.decorators';
import { PublicService } from './public.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 30 } }) // shareable page, hostile internet
  @Get('impact')
  @ApiOperation({
    summary: 'Public impact aggregates — cached, rate-limited, no personal data',
    description:
      'Headline stats, per-programme impact, public gallery and published testimonials only. ' +
      'Attribution is first name + last initial; nothing else about a volunteer leaves the system here.',
  })
  impact() {
    return this.publicService.impact();
  }
}
