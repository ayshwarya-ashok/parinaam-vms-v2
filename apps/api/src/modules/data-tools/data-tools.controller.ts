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
    summary: 'Reset & seed demo data (feature-flagged, admin only)',
    description:
      'Wipes the database back to a scripted client-demo baseline whose session dates are ' +
      'computed from today, so every status is demoable whenever it runs: the client catalog ' +
      '(3 programs / 4 activities / 10 sessions incl. draft, full-with-waitlist, running today, ' +
      'in progress, completed and cancelled), 8 scenario volunteers, the primary admin, 3 field ' +
      'coordinators, attendance, feedback, and real certificate PDFs (program + custom, one ' +
      'deliberately stale). Requires confirm: "RESET".',
  })
  reset(@CurrentUser() user: AuthPrincipal, @Body() _dto: ResetDto) {
    return this.service.reset(user);
  }
}
