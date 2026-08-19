import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AuthPrincipal,
  CurrentUser,
  Roles,
} from '../../common/decorators/auth.decorators';
import {
  AdminUpdateVolunteerDto,
  RegisterVolunteerDto,
  SignConsentDto,
  UpdateProfileDto,
} from './volunteers.dto';
import { VolunteersService } from './volunteers.service';

@ApiTags('volunteers')
@Controller()
export class VolunteersController {
  constructor(private readonly service: VolunteersService) {}

  // ── Self-service ────────────────────────────────────────────────────────────

  @Post('volunteers')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Complete volunteer registration (the profile step)' })
  register(@CurrentUser() user: AuthPrincipal, @Body() dto: RegisterVolunteerDto) {
    return this.service.register(user, dto);
  }

  @Get('volunteers/me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Own profile' })
  me(@CurrentUser() user: AuthPrincipal) {
    return this.service.me(user);
  }

  @Patch('volunteers/me')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Update own profile' })
  updateMe(@CurrentUser() user: AuthPrincipal, @Body() dto: UpdateProfileDto) {
    return this.service.updateMe(user, dto);
  }

  @Get('volunteers/me/compliance')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Consent + mandatory-training status (BR-02, BR-04)' })
  compliance(@CurrentUser() user: AuthPrincipal) {
    return this.service.compliance(user);
  }

  @Get('volunteers/me/consent')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Current consent record' })
  getConsent(@CurrentUser() user: AuthPrincipal) {
    return this.service.getConsent(user);
  }

  @Post('volunteers/me/consent')
  @Roles('volunteer')
  @ApiOperation({ summary: 'Sign the POCSO/POSH/NDA agreement (BR-02)' })
  signConsent(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: SignConsentDto,
    @Req() req: Request,
  ) {
    return this.service.signConsent(user, dto, req.ip, req.headers['user-agent']);
  }

  // ── CSR organization picker ─────────────────────────────────────────────────

  @Get('organizations')
  @ApiOperation({ summary: 'Active organizations — id and name for the CSR picker' })
  organizations() {
    return this.service.listOrganizations();
  }

  // ── Admin directory (open question Q1 — confirmed in scope) ────────────────

  @Get('volunteers')
  @Roles('admin')
  @ApiOperation({ summary: 'Volunteer directory with search and filters' })
  directory(
    @Query('q') q?: string,
    @Query('phase') phase?: string,
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.directory({ q, phase, category, city, limit, offset });
  }

  @Get('volunteers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Full volunteer profile' })
  adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminGet(id);
  }

  @Patch('volunteers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin update — phase override, activate/deactivate' })
  adminUpdate(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateVolunteerDto,
  ) {
    return this.service.adminUpdate(user, id, dto);
  }
}
