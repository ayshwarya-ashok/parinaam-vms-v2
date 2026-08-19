import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Response } from 'express';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import { UUID_PATTERN, UuidPipe } from '../../common/pipes/uuid.pipe';
import { CertificatesService } from './certificates.service';

class IssueDto {
  @Matches(UUID_PATTERN) volunteerId!: string;
  @Matches(UUID_PATTERN) programId!: string;
}

class IssueBulkDto {
  @Matches(UUID_PATTERN) programId!: string;
}

class ListQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Matches(UUID_PATTERN) programId?: string;
  @IsOptional() @IsIn(['issued', 'pending']) status?: 'issued' | 'pending';
}

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Certificate candidates — every attended (volunteer, programme) pair with issue state' })
  async list(@Query() query: ListQuery) {
    return { data: await this.certificates.candidates(query) };
  }

  @Post('issue')
  @Roles('admin')
  @ApiOperation({ summary: 'Issue the certificate for one volunteer in one programme (render, store, email)' })
  issue(@Body() dto: IssueDto, @CurrentUser() user: AuthPrincipal) {
    return this.certificates.issue(dto.volunteerId, dto.programId, user.sub);
  }

  @Post('issue-bulk')
  @Roles('admin')
  @ApiOperation({ summary: 'Issue certificates for every eligible, not-yet-issued volunteer in a programme' })
  issueBulk(@Body() dto: IssueBulkDto, @CurrentUser() user: AuthPrincipal) {
    return this.certificates.issueBulk(dto.programId, user.sub);
  }

  @Post(':id/resend')
  @Roles('admin')
  @ApiOperation({ summary: 'Re-email the exact document already on file' })
  resend(@Param('id', UuidPipe) id: string) {
    return this.certificates.resend(id);
  }

  @Post(':id/reissue')
  @Roles('admin')
  @ApiOperation({ summary: 'Recompute hours/period, re-render and re-send (attendance changed after issue)' })
  reissue(@Param('id', UuidPipe) id: string, @CurrentUser() user: AuthPrincipal) {
    return this.certificates.reissueById(id, user.sub);
  }

  @Get('me')
  @Roles('volunteer')
  @ApiOperation({ summary: "The signed-in volunteer's certificate wallet" })
  async mine(@CurrentUser() user: AuthPrincipal) {
    return { data: await this.certificates.mine(user.sub) };
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download the PDF — admin, or the owning volunteer' })
  async download(
    @Param('id', UuidPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ) {
    const { data, filename } = await this.certificates.download(id, user);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      .send(data);
  }
}
