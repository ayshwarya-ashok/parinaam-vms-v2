import {
  Body,
  Controller,
  Get,
  Param,
    Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UuidPipe } from '../../common/pipes/uuid.pipe';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { BusinessException } from '../../common';
import {
  AuthPrincipal,
  CurrentUser,
  Public,
  Roles,
} from '../../common/decorators/auth.decorators';
import {
  AdminCreateVolunteerDto,
  AdminUpdateVolunteerDto,
  InviteVolunteersDto,
  RegisterVolunteerDto,
  ReviewRegistrationDto,
  SignConsentDto,
  UpdateProfileDto,
  UpdateRegistrationDto,
} from './volunteers.dto';
import { VolunteersService } from './volunteers.service';

@ApiTags('volunteers')
@Controller()
export class VolunteersController {
  constructor(private readonly service: VolunteersService) {}

  // ── Self-service ────────────────────────────────────────────────────────────

  @Post('volunteers')
  @Roles('volunteer')
  @ApiOperation({
    summary: 'Complete the profile on an account that has none',
    description:
      'For accounts orphaned by the old two-step signup. New registrations go through ' +
      'POST /auth/register, which writes the account and the profile together.',
  })
  completeProfile(@CurrentUser() user: AuthPrincipal, @Body() dto: RegisterVolunteerDto) {
    return this.service.completeProfile(user, dto);
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

  @Public()
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
    @Query('registrationStatus') registrationStatus?: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.service.directory({ q, phase, category, city, registrationStatus, limit, offset });
  }

  @Get('volunteers/import-template')
  @Roles('admin')
  @ApiOperation({ summary: 'The XLSX reference template for the bulk import (mandatory columns starred)' })
  async importTemplate(@Res() res: Response) {
    const buffer = await this.service.importTemplate();
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', 'attachment; filename="volunteer-import-template.xlsx"')
      .send(buffer);
  }

  @Get('volunteers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Full volunteer profile' })
  adminGet(@Param('id', UuidPipe) id: string) {
    return this.service.adminGet(id);
  }

  @Patch('volunteers/:id')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin update — phase override, activate/deactivate' })
  adminUpdate(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: AdminUpdateVolunteerDto,
  ) {
    return this.service.adminUpdate(user, id, dto);
  }

  @Patch('volunteers/:id/registration')
  @Roles('admin')
  @ApiOperation({
    summary: 'Correct what the volunteer entered, while the registration is pending',
    description:
      'Available only before approve/reject — afterwards the record has been acted on and edits ' +
      'belong to the volunteer profile instead.',
  })
  updateRegistration(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: UpdateRegistrationDto,
  ) {
    return this.service.updateRegistration(user, id, dto);
  }

  @Post('volunteers/:id/approve')
  @Roles('admin')
  @ApiOperation({ summary: 'Approve a registration — the account stays active' })
  approve(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: ReviewRegistrationDto,
  ) {
    return this.service.review(user, id, 'approved', dto);
  }

  @Post('volunteers/:id/reject')
  @Roles('admin')
  @ApiOperation({
    summary: 'Reject a registration',
    description: 'Requires a reason and deactivates the account — a rejected applicant keeps no login.',
  })
  reject(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', UuidPipe) id: string,
    @Body() dto: ReviewRegistrationDto,
  ) {
    return this.service.review(user, id, 'rejected', dto);
  }

  @Post('volunteers/import')
  @Roles('admin')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Bulk-create volunteers from the XLSX template — per-row validation, duplicates skipped and reported' })
  importXlsx(
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BusinessException('IMPORT_INVALID', 'Attach the filled-in .xlsx file as "file".', 400);
    }
    return this.service.importFromXlsx(user, file.buffer);
  }

  @Post('volunteers/admin-create')
  @Roles('admin')
  @ApiOperation({ summary: 'Admin adds one volunteer directly — created approved; consent still gates enrollment' })
  adminCreate(@CurrentUser() user: AuthPrincipal, @Body() dto: AdminCreateVolunteerDto) {
    return this.service.adminCreate(user, dto);
  }

  @Post('volunteers/invite')
  @Roles('admin')
  @ApiOperation({ summary: "Bulk-invite a company's employees to register (already-registered addresses are skipped)" })
  invite(@CurrentUser() user: AuthPrincipal, @Body() dto: InviteVolunteersDto) {
    return this.service.invite(user, dto);
  }

  @Post('volunteers/:id/welcome-back')
  @Roles('admin')
  @ApiOperation({ summary: 'Re-send the welcome-back email (sent automatically on inactive → active)' })
  welcomeBack(@Param('id', UuidPipe) id: string) {
    return this.service.sendWelcomeBack(id);
  }

  @Post('volunteers/:id/erase')
  @Roles('admin')
  @ApiOperation({
    summary: "Irreversibly erase a volunteer's personal data",
    description:
      'Anonymises name/contact, disables the account, revokes sessions and links, and strips ' +
      'free-text feedback. Contribution aggregates (hours, attendance, beneficiaries) are kept.',
  })
  erase(@CurrentUser() user: AuthPrincipal, @Param('id', UuidPipe) id: string) {
    return this.service.erase(user, id);
  }
}
