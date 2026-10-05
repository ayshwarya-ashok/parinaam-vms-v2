import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { AuthPrincipal, CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { DataToolsService } from './data-tools.service';

/**
 * The reset is destructive and one click would be too few: the caller must
 * send the literal word, which the page collects through a type-in field.
 */
class ResetDto {
  @IsIn(['RESET']) confirm!: 'RESET';
}

@ApiTags('data-tools')
@Controller('data-tools')
export class DataToolsController {
  constructor(private readonly service: DataToolsService) {}

  @Get('status')
  @Roles('admin')
  @ApiOperation({ summary: 'Whether the Data Tools feature flag is on (DATA_TOOLS_ENABLED)' })
  status() {
    return { enabled: this.service.enabled };
  }

  @Post('reset')
  @Roles('admin')
  @ApiOperation({
    summary: 'Reset to the client baseline (feature-flagged, admin only)',
    description:
      'Keeps the client-document catalog (3 programs / 4 activities / 5 sessions), ten curated ' +
      'volunteers, the primary admin and three field coordinators; removes everything else. ' +
      'Requires confirm: "RESET".',
  })
  reset(@CurrentUser() user: AuthPrincipal, @Body() _dto: ResetDto) {
    return this.service.reset(user);
  }
}
