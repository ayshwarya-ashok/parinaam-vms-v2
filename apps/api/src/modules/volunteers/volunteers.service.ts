import { Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import {
  Organization,
  User,
  Volunteer,
  VolunteerConsent,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { NotificationsService } from '../notifications';
import {
  AdminCreateVolunteerDto,
  RegisterAccountDto,
  RegisterVolunteerDto,
  ReviewRegistrationDto,
  SignConsentDto,
  UpdateProfileDto,
} from './volunteers.dto';

/** Multi-select answers travel as arrays and rest as comma-joined codes. */
function joinCodes(codes: string[] | undefined): string | null {
  if (!codes || codes.length === 0) return null;
  return [...new Set(codes.map((c) => c.trim()).filter(Boolean))].join(',');
}

interface ComplianceRow {
  consent_complete: boolean;
  mandatory_total: number;
  mandatory_passed: number;
  is_compliant: boolean;
  earliest_expiry: string | null;
}

@Injectable()
export class VolunteersService {
  constructor(
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    @InjectRepository(VolunteerConsent) private readonly consents: Repository<VolunteerConsent>,
    @InjectRepository(Organization) private readonly organizations: Repository<Organization>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly passwords: PasswordService,
  ) {}

  // ── Registration (account + profile, atomically) ──────────────────────────

  /**
   * Create the account AND the profile, or neither.
   *
   * Registration used to be two steps — signup wrote a user, the profile form
   * wrote a volunteer — so every abandoned form left an orphan account that
   * could log in and see nothing. One transaction removes that state entirely:
   * no profile, no account.
   *
   * The result is a REQUEST, not an admission. It lands as `pending` for an
   * administrator to approve or reject.
   */
  async registerWithAccount(
    dto: RegisterAccountDto,
    passwordHash: string,
  ): Promise<{ user: User; volunteer: Volunteer }> {
    this.assertCategoryRules(dto);

    if (dto.organizationId) {
      const org = await this.organizations.findOne({
        where: { id: dto.organizationId, isActive: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
    }

    const existingUser = await this.users.findOne({ where: { email: dto.email } });
    if (existingUser) {
      throw new BusinessException(
        'EMAIL_TAKEN',
        'An account with this email already exists. Try logging in.',
        409,
      );
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, {
          email: dto.email,
          passwordHash,
          role: 'volunteer' as const,
        }),
      );

      const volunteer = await manager.save(
        manager.create(Volunteer, {
          userId: user.id,
          ...this.profileFields(dto),
          category: dto.category,
          organizationId: dto.organizationId ?? null,
          complianceRead: dto.complianceRead,
          registrationStatus: 'pending' as const,
        }),
      );

      return { user, volunteer };
    });

    await this.audit.record(
      { sub: created.user.id, email: created.user.email, role: 'volunteer' },
      {
        action: 'volunteer.registered',
        entity: 'volunteers',
        entityId: created.volunteer.id,
        after: { category: created.volunteer.category, city: created.volunteer.city },
      },
    );

    return created;
  }

  /**
   * Complete the profile on an account that already exists without one.
   *
   * Registration is atomic now, so this state cannot be created any more — but
   * accounts orphaned by the previous two-step flow still exist, and their
   * owners must be able to finish rather than be stranded at a form that has
   * no password to submit. This CANNOT create an account, so the "no account
   * without a profile" rule still holds.
   */
  async completeProfile(principal: AuthPrincipal, dto: RegisterVolunteerDto): Promise<Volunteer> {
    const existing = await this.volunteers.findOne({ where: { userId: principal.sub } });
    if (existing) {
      throw new BusinessException(
        'ALREADY_REGISTERED',
        'Your volunteer profile already exists.',
        409,
      );
    }
    this.assertCategoryRules(dto);

    if (dto.organizationId) {
      const org = await this.organizations.findOne({
        where: { id: dto.organizationId, isActive: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
    }

    const saved = await this.volunteers.save(
      this.volunteers.create({
        userId: principal.sub,
        ...this.profileFields(dto),
        category: dto.category,
        organizationId: dto.organizationId ?? null,
        complianceRead: dto.complianceRead,
        registrationStatus: 'pending',
      }),
    );

    await this.audit.record(principal, {
      action: 'volunteer.registered',
      entity: 'volunteers',
      entityId: saved.id,
      after: { category: saved.category, city: saved.city, via: 'legacy profile completion' },
    });

    return saved;
  }

  /** True when this address is free — lets the form fail fast, before the long part. */
  async isEmailAvailable(email: string): Promise<boolean> {
    const existing = await this.users.findOne({ where: { email } });
    return existing === null;
  }

  /** BR-01: a CSR volunteer must name their sponsoring organization. */
  private assertCategoryRules(dto: RegisterVolunteerDto): void {
    if (dto.category === 'CSR' && !dto.organizationId) {
      throw new BusinessException(
        'ORGANIZATION_REQUIRED',
        'CSR volunteers must select their sponsoring organization.',
        400,
      );
    }
    if (dto.category === 'Individual') {
      dto.organizationId = undefined;
    }
  }

  /** Shared shape between registration and profile edits. Codes are joined here. */
  private profileFields(dto: RegisterVolunteerDto) {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      gender: (dto.gender as Volunteer['gender']) ?? null,
      dateOfBirth: dto.dateOfBirth ?? null,
      city: dto.city ?? null,
      state: dto.state ?? null,
      phone: dto.phone ?? null,
      skills: dto.skills ?? null,
      occupation: dto.occupation ?? null,
      languages: joinCodes(dto.languages),
      areasOfInterest: joinCodes(dto.areasOfInterest),
      availability: joinCodes(dto.availability),
      availabilityNotes: dto.availabilityNotes?.trim() || null,
    };
  }

  // ── Own profile ────────────────────────────────────────────────────────────

  async me(principal: AuthPrincipal): Promise<Volunteer> {
    const volunteer = await this.volunteers.findOne({
      where: { userId: principal.sub },
      relations: { organization: true },
    });
    if (!volunteer) {
      throw new BusinessException(
        'PROFILE_INCOMPLETE',
        'Complete your volunteer registration first.',
        404,
      );
    }
    return volunteer;
  }

  async updateMe(principal: AuthPrincipal, dto: UpdateProfileDto): Promise<Volunteer> {
    const volunteer = await this.me(principal);
    Object.assign(volunteer, {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.gender !== undefined && { gender: dto.gender }),
      ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.skills !== undefined && { skills: dto.skills }),
      ...(dto.occupation !== undefined && { occupation: dto.occupation }),
      ...(dto.languages !== undefined && { languages: joinCodes(dto.languages) }),
      ...(dto.areasOfInterest !== undefined && { areasOfInterest: joinCodes(dto.areasOfInterest) }),
      ...(dto.availability !== undefined && { availability: joinCodes(dto.availability) }),
      ...(dto.availabilityNotes !== undefined && { availabilityNotes: dto.availabilityNotes }),
      ...(dto.emailOptIn !== undefined && { emailOptIn: dto.emailOptIn }),
    });
    return this.volunteers.save(volunteer);
  }

  // ── Compliance status (BR-02 / BR-04 surface) ──────────────────────────────

  async compliance(principal: AuthPrincipal) {
    const volunteer = await this.me(principal);
    const [row] = await this.dataSource.query<ComplianceRow[]>(
      'SELECT * FROM v_volunteer_compliance WHERE volunteer_id = $1',
      [volunteer.id],
    );
    return {
      volunteerId: volunteer.id,
      phase: volunteer.phase,
      consentComplete: row?.consent_complete ?? false,
      mandatoryTotal: Number(row?.mandatory_total ?? 0),
      mandatoryPassed: Number(row?.mandatory_passed ?? 0),
      isCompliant: row?.is_compliant ?? false,
      earliestExpiry: row?.earliest_expiry ?? null,
    };
  }

  // ── Consent (BR-02) ─────────────────────────────────────────────────────────

  async getConsent(principal: AuthPrincipal) {
    const volunteer = await this.me(principal);
    const consent = await this.consents.findOne({ where: { volunteerId: volunteer.id } });
    return { signed: consent !== null, consent };
  }

  async signConsent(
    principal: AuthPrincipal,
    dto: SignConsentDto,
    ip?: string,
    userAgent?: string,
  ) {
    if (!dto.pocsoAgreed || !dto.poshAgreed || !dto.ndaAgreed) {
      throw new BusinessException(
        'CONSENT_INCOMPLETE',
        'All three policies must be agreed to proceed.',
        400,
      );
    }

    const volunteer = await this.me(principal);
    const existing = await this.consents.findOne({ where: { volunteerId: volunteer.id } });
    if (existing) {
      throw new BusinessException('ALREADY_SIGNED', 'Consent is already on record.', 409);
    }

    const consent = await this.consents.save(
      this.consents.create({
        volunteerId: volunteer.id,
        pocsoAgreed: true,
        poshAgreed: true,
        ndaAgreed: true,
        signedName: dto.signedName,
        consentDate: dto.consentDate,
        ipAddress: ip ?? null,
        userAgent: userAgent?.slice(0, 400) ?? null,
      }),
    );

    // BR-14 — the database function owns the lifecycle transition.
    const [{ fn_recompute_volunteer_phase: phase }] = await this.dataSource.query(
      'SELECT fn_recompute_volunteer_phase($1)',
      [volunteer.id],
    );

    await this.audit.record(principal, {
      action: 'consent.signed',
      entity: 'volunteer_consents',
      entityId: consent.id,
      after: {
        signedName: dto.signedName,
        consentDate: dto.consentDate,
        version: consent.consentVersion,
      },
      ip,
    });

    return { consent, phase };
  }

  // ── Organizations (CSR picker) ──────────────────────────────────────────────

  async listOrganizations() {
    return this.organizations.find({
      where: { isActive: true },
      select: { id: true, name: true },
      order: { name: 'ASC' },
    });
  }

  // ── Admin directory ─────────────────────────────────────────────────────────

  async directory(query: {
    q?: string;
    phase?: string;
    category?: string;
    city?: string;
    registrationStatus?: string;
    limit?: number;
    offset?: number;
  }) {
    // NaN-safe: with implicit conversion a missing numeric query param arrives
    // as NaN, which ?? does not catch.
    const limit = Math.min(Number(query.limit) || 25, 100);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const qb = this.volunteers
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.user', 'u')
      .leftJoinAndSelect('v.organization', 'o')
      .orderBy('v.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (query.q) {
      /*
       * One box, three ways to find someone: name, email or phone number.
       *
       * Numbers are stored as they were typed — "+91 98200 11011" and
       * "9820011011" are the same person — so both the stored value and the
       * search term are reduced to digits before comparing. Without that,
       * searching the number a volunteer reads off their own phone would miss
       * the record that holds it.
       */
      // Reduce to the ten significant digits: a search typed as
      // "+91 98200 11005" yields 919820011005, which would never LIKE-match a
      // stored "9820011005". Taking the last ten drops the country code the
      // same way the web client does before saving.
      const digits = query.q.replace(/[^0-9]/g, '').slice(-10);
      qb.andWhere(
        `(v.firstName ILIKE :q OR v.lastName ILIKE :q OR u.email::text ILIKE :q
          OR (:digits <> '' AND regexp_replace(COALESCE(v.phone, ''), '[^0-9]', '', 'g') LIKE :phoneLike))`,
        { q: `%${query.q}%`, digits, phoneLike: `%${digits}%` },
      );
    }
    if (query.phase) qb.andWhere('v.phase = :phase', { phase: query.phase });
    if (query.registrationStatus) {
      qb.andWhere('v.registrationStatus = :rs', { rs: query.registrationStatus });
    }
    if (query.category) qb.andWhere('v.category = :category', { category: query.category });
    if (query.city) qb.andWhere('v.city ILIKE :city', { city: query.city });

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((v) => ({
        id: v.id,
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.user?.email,
        phone: v.phone,
        city: v.city,
        category: v.category,
        organization: v.organization?.name ?? null,
        phase: v.phase,
        isActive: v.user?.isActive ?? true,
        registrationStatus: v.registrationStatus,
        reviewedAt: v.reviewedAt,
        rejectionReason: v.rejectionReason,
        createdAt: v.createdAt,
      })),
      meta: { total, limit, offset, pending: await this.pendingCount() },
    };
  }

  async adminGet(id: string) {
    const volunteer = await this.volunteers.findOne({
      where: { id },
      relations: { user: true, organization: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    const consent = await this.consents.findOne({ where: { volunteerId: id } });
    const [reviewer] = volunteer.reviewedBy
      ? await this.dataSource.query('SELECT email FROM users WHERE id = $1', [volunteer.reviewedBy])
      : [];

    // Contribution summary, so "approve or reject" is judged against the whole
    // person rather than the form alone.
    const [participation] = await this.dataSource.query(
      `SELECT COALESCE(SUM(pp.total_hours), 0) AS total_hours,
              COALESCE(SUM(pp.events_attended), 0)::int AS events_attended,
              COUNT(*)::int AS programs
       FROM v_program_participation pp WHERE pp.volunteer_id = $1`,
      [id],
    );

    return {
      ...volunteer,
      email: volunteer.user?.email,
      isActive: volunteer.user?.isActive ?? true,
      consentSigned: consent !== null,
      consent,
      reviewedByEmail: reviewer?.email ?? null,
      participation,
    };
  }

  /**
   * Correct what a volunteer entered, while their registration is still
   * pending.
   *
   * Bounded to the pending state on purpose: before a decision, an admin
   * fixing a transposed phone number or a mis-picked category is completing
   * the same registration. After approval the record has been acted on —
   * hours, certificates and compliance hang off it — so edits there belong to
   * the volunteer's own profile, not to a review screen.
   */
  async updateRegistration(
    principal: AuthPrincipal,
    id: string,
    dto: UpdateProfileDto & { category?: 'Individual' | 'CSR'; organizationId?: string | null },
  ) {
    const volunteer = await this.volunteers.findOne({ where: { id } });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    if (volunteer.registrationStatus !== 'pending') {
      throw new BusinessException(
        'REGISTRATION_REVIEWED',
        `This registration has already been ${volunteer.registrationStatus}. Reviewed registrations can no longer be edited here.`,
        409,
      );
    }

    const category = dto.category ?? volunteer.category;
    const organizationId =
      category === 'CSR' ? (dto.organizationId ?? volunteer.organizationId) : null;

    if (category === 'CSR' && !organizationId) {
      throw new BusinessException(
        'ORGANIZATION_REQUIRED',
        'CSR volunteers must name their sponsoring organization.',
        400,
      );
    }
    if (organizationId) {
      const org = await this.organizations.findOne({ where: { id: organizationId, isActive: true } });
      if (!org) throw new NotFoundException('Organization not found');
    }

    const before = {
      firstName: volunteer.firstName,
      lastName: volunteer.lastName,
      phone: volunteer.phone,
      city: volunteer.city,
      category: volunteer.category,
    };

    Object.assign(volunteer, {
      ...(dto.firstName !== undefined && { firstName: dto.firstName }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      ...(dto.gender !== undefined && { gender: dto.gender as Volunteer['gender'] }),
      ...(dto.dateOfBirth !== undefined && { dateOfBirth: dto.dateOfBirth }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.phone !== undefined && { phone: dto.phone }),
      ...(dto.skills !== undefined && { skills: dto.skills }),
      ...(dto.occupation !== undefined && { occupation: dto.occupation }),
      ...(dto.languages !== undefined && { languages: joinCodes(dto.languages) }),
      ...(dto.areasOfInterest !== undefined && { areasOfInterest: joinCodes(dto.areasOfInterest) }),
      ...(dto.availability !== undefined && { availability: joinCodes(dto.availability) }),
      ...(dto.availabilityNotes !== undefined && { availabilityNotes: dto.availabilityNotes }),
      category,
      organizationId,
    });
    await this.volunteers.save(volunteer);

    await this.audit.record(principal, {
      action: 'volunteer.registration_edited',
      entity: 'volunteers',
      entityId: id,
      before,
      after: {
        firstName: volunteer.firstName,
        lastName: volunteer.lastName,
        phone: volunteer.phone,
        city: volunteer.city,
        category: volunteer.category,
      },
    });

    return this.adminGet(id);
  }

  async pendingCount(): Promise<number> {
    return this.volunteers.count({ where: { registrationStatus: 'pending' } });
  }

  /**
   * Approve or reject a registration.
   *
   * Approval leaves the account active. Rejection deactivates it — a rejected
   * applicant must not keep a working login — and records why, because the
   * person will ask and somebody has to answer.
   */
  async review(
    principal: AuthPrincipal,
    id: string,
    decision: 'approved' | 'rejected',
    dto: ReviewRegistrationDto,
  ) {
    const volunteer = await this.volunteers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    if (volunteer.registrationStatus === decision) {
      throw new BusinessException(
        'ALREADY_REVIEWED',
        `This registration is already ${decision}.`,
        409,
      );
    }
    const reason = dto.reason?.trim();
    if (decision === 'rejected' && !reason) {
      throw new BusinessException(
        'REASON_REQUIRED',
        'Give a reason for the rejection — the volunteer will be told.',
        400,
      );
    }

    const before = {
      registrationStatus: volunteer.registrationStatus,
      isActive: volunteer.user?.isActive,
    };

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Volunteer, { id }, {
        registrationStatus: decision,
        reviewedBy: principal.sub,
        reviewedAt: new Date(),
        rejectionReason: decision === 'rejected' ? reason! : null,
      });
      await manager.update(User, { id: volunteer.userId }, {
        isActive: decision === 'approved',
      });
    });

    await this.notifications
      .queueEmail({
        templateKey: decision === 'approved' ? 'registration_approved' : 'registration_rejected',
        to: volunteer.user.email,
        recipientType: 'volunteer',
        volunteerId: id,
        context: {
          firstName: volunteer.firstName,
          reason: reason ?? null,
        },
      })
      .catch(() => undefined);

    await this.audit.record(principal, {
      action: `volunteer.${decision === 'approved' ? 'approved' : 'rejected'}`,
      entity: 'volunteers',
      entityId: id,
      before,
      after: { registrationStatus: decision, reason: reason ?? null },
    });

    return this.adminGet(id);
  }

  async adminUpdate(
    principal: AuthPrincipal,
    id: string,
    dto: { phase?: string; isActive?: boolean },
  ) {
    const volunteer = await this.volunteers.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    const before = { phase: volunteer.phase, isActive: volunteer.user?.isActive };

    if (dto.phase) {
      volunteer.phase = dto.phase as Volunteer['phase'];
      await this.volunteers.save(volunteer);
    }
    if (dto.isActive !== undefined && volunteer.user) {
      await this.users.update({ id: volunteer.userId }, { isActive: dto.isActive });
    }

    await this.audit.record(principal, {
      action: 'volunteer.admin_updated',
      entity: 'volunteers',
      entityId: id,
      before,
      after: dto,
    });

    // Welcome-Back fires on the inactive → active transition (client decision,
    // 2026-08-25) — not on a schedule. Re-allotment content: their previous
    // community's upcoming sessions.
    if (dto.isActive === true && before.isActive === false) {
      await this.sendWelcomeBack(id);
    }

    return this.adminGet(id);
  }

  // ── Admin-side volunteer creation (single + XLSX bulk import) ──────────────

  private static readonly IMPORT_GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
  private static readonly IMPORT_DEFAULT_PASSWORD = 'Parinaam@123';
  private static readonly IMPORT_COLUMNS = [
    'email*', 'first_name*', 'last_name*', 'gender*', 'date_of_birth* (YYYY-MM-DD)',
    'city*', 'state*', 'phone* (10 digits)', 'skills', 'occupation',
  ];

  /** Bare ten digits, tolerating +91 / 91 / 0 prefixes; null when unusable. */
  private static tenDigitPhone(raw: string): string | null {
    let d = raw.replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return d.length === 10 ? d : null;
  }

  /**
   * The reference workbook an admin downloads before importing: the exact
   * header row the parser expects, two worked sample rows, and a Read-me
   * sheet spelling out the rules. Only the starred columns are mandatory.
   */
  async importTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Volunteers');
    sheet.addRow(VolunteersService.IMPORT_COLUMNS);
    sheet.getRow(1).font = { bold: true };
    sheet.columns.forEach((c, i) => (c.width = i < 8 ? 22 : 16));
    sheet.addRow(['asha.k@example.org', 'Asha', 'Krishnan', 'Female', '1996-04-18', 'Bengaluru', 'Karnataka', '9876501234', 'teaching, storytelling', 'Teacher']);
    sheet.addRow(['vikas.m@example.org', 'Vikas', 'Menon', 'Male', '1989-11-02', 'Bengaluru', 'Karnataka', '+91 98765 43210', '', '']);

    const readme = wb.addWorksheet('Read me');
    readme.getColumn(1).width = 100;
    [
      'How this import works',
      '',
      '• Columns marked * are mandatory; everything else may be left blank.',
      '• gender must be one of: Female, Male, Non-binary, Prefer not to say.',
      '• date_of_birth format: YYYY-MM-DD (a real Excel date cell also works).',
      '• phone: an Indian mobile number — +91 / 91 / 0 prefixes are accepted and normalised to 10 digits.',
      '• Every imported volunteer starts with the initial password "' + VolunteersService.IMPORT_DEFAULT_PASSWORD + '" — ask them to change it after their first login (Profile → Change password).',
      '• Rows whose email already has an account are skipped and reported back, never overwritten.',
      '• Imported volunteers are created APPROVED (you are the reviewer) but must still sign the consent forms on first login before enrolling.',
      '• Maximum 200 rows per file.',
    ].forEach((t) => readme.addRow([t]));
    readme.getRow(1).font = { bold: true, size: 13 };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** One row's create — shared by the single add and the bulk import. */
  private async createApproved(
    principal: AuthPrincipal,
    data: {
      email: string; firstName: string; lastName: string; gender: string;
      dateOfBirth: string; city: string; state: string; phone: string;
      skills?: string | null; occupation?: string | null; password?: string | null;
    },
  ): Promise<Volunteer> {
    const passwordHash = await this.passwords.hash(
      data.password?.trim() || VolunteersService.IMPORT_DEFAULT_PASSWORD,
    );
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(
        manager.create(User, { email: data.email, passwordHash, role: 'volunteer' as const }),
      );
      return manager.save(
        manager.create(Volunteer, {
          userId: user.id,
          firstName: data.firstName,
          lastName: data.lastName,
          gender: data.gender as Volunteer['gender'],
          dateOfBirth: data.dateOfBirth,
          city: data.city,
          state: data.state,
          phone: data.phone,
          skills: data.skills?.trim() || null,
          occupation: data.occupation?.trim() || null,
          category: 'Individual' as const,
          complianceRead: false,
          registrationStatus: 'approved' as const,
          reviewedBy: principal.sub,
          reviewedAt: new Date(),
        }),
      );
    });
  }

  /** Admin adds one volunteer directly — created approved, consent still gated. */
  async adminCreate(principal: AuthPrincipal, dto: AdminCreateVolunteerDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.users.findOne({ where: { email } });
    if (exists) {
      throw new BusinessException('EMAIL_TAKEN', 'An account with this email already exists.', 409);
    }
    const phone = VolunteersService.tenDigitPhone(dto.phone);
    if (!phone) {
      throw new BusinessException('NOT_ELIGIBLE', 'Enter a 10-digit mobile number.', 400);
    }
    const volunteer = await this.createApproved(principal, { ...dto, email, phone });
    await this.audit.record(principal, {
      action: 'volunteer.admin_created',
      entity: 'volunteers',
      entityId: volunteer.id,
      after: { email, defaultPassword: !dto.password },
    });
    return {
      id: volunteer.id,
      email,
      defaultPasswordUsed: !dto.password?.trim(),
    };
  }

  /**
   * XLSX bulk import. Row-by-row: mandatory fields only (the starred template
   * columns), per-row validation with reasons reported back, duplicates
   * skipped — one bad row never sinks the file.
   */
  async importFromXlsx(principal: AuthPrincipal, buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw new BusinessException('IMPORT_INVALID', 'Not a readable .xlsx file — download the template and start from it.', 400);
    }
    const sheet = wb.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      throw new BusinessException('IMPORT_INVALID', 'The first sheet has no data rows.', 400);
    }
    if (sheet.rowCount > 201) {
      throw new BusinessException('IMPORT_INVALID', 'Maximum 200 rows per import — split the file.', 400);
    }

    // Header → column index, tolerant of the template's annotations.
    const colOf: Record<string, number> = {};
    sheet.getRow(1).eachCell((cell, col) => {
      const key = String(cell.text ?? '').toLowerCase().split('(')[0].replace(/[^a-z_]/g, '');
      if (key) colOf[key] = col;
    });
    const required = ['email', 'first_name', 'last_name', 'gender', 'date_of_birth', 'city', 'state', 'phone'];
    const missing = required.filter((k) => !colOf[k.replace(/[^a-z_]/g, '')]);
    if (missing.length > 0) {
      throw new BusinessException('IMPORT_INVALID', 'Missing column(s): ' + missing.join(', ') + '. Download the template for the expected format.', 400);
    }

    const text = (row: ExcelJS.Row, key: string): string => {
      const col = colOf[key.replace(/[^a-z_]/g, '')];
      if (!col) return '';
      const v = row.getCell(col).value;
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(row.getCell(col).text ?? '').trim();
    };

    let created = 0;
    const skipped: Array<{ row: number; email: string; reason: string }> = [];

    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const email = text(row, 'email').toLowerCase();
      const skip = (reason: string) => skipped.push({ row: r, email: email || '(blank)', reason });

      if (!email && !text(row, 'first_name')) continue; // fully blank row
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skip('invalid or missing email'); continue; }

      const firstName = text(row, 'first_name');
      const lastName = text(row, 'last_name');
      if (!firstName || !lastName) { skip('first and last name are mandatory'); continue; }

      const genderRaw = text(row, 'gender');
      const gender = VolunteersService.IMPORT_GENDERS.find(
        (g) => g.toLowerCase() === genderRaw.toLowerCase(),
      );
      if (!gender) { skip('gender must be one of: ' + VolunteersService.IMPORT_GENDERS.join(', ')); continue; }

      const dob = text(row, 'date_of_birth');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) {
        skip('date_of_birth must be YYYY-MM-DD'); continue;
      }

      const city = text(row, 'city');
      const state = text(row, 'state');
      if (!city || !state) { skip('city and state are mandatory'); continue; }

      const phone = VolunteersService.tenDigitPhone(text(row, 'phone'));
      if (!phone) { skip('phone must be a 10-digit mobile number'); continue; }

      const exists = await this.users.findOne({ where: { email } });
      if (exists) { skip('already registered'); continue; }

      // Every import gets the documented initial password — the template
      // deliberately has no password column (client decision, Round 14).
      await this.createApproved(principal, {
        email, firstName, lastName, gender, dateOfBirth: dob, city, state, phone,
        skills: text(row, 'skills') || null,
        occupation: text(row, 'occupation') || null,
        password: null,
      });
      created += 1;
    }

    await this.audit.record(principal, {
      action: 'volunteer.imported',
      entity: 'volunteers',
      after: { created, skipped: skipped.length },
    });
    return {
      created,
      skipped,
      defaultPassword: created > 0 ? VolunteersService.IMPORT_DEFAULT_PASSWORD : null,
    };
  }

  /**
   * Bulk corporate invites (client doc: Exposure Visits / outings onboard a
   * company's employees as a batch). Sends one registration-invite email per
   * address through the outbox -> n8n pipeline; addresses that already hold an
   * account are skipped and reported back. Re-triggering is just sending again.
   */
  async invite(
    principal: AuthPrincipal,
    dto: { emails: string[]; organizationId?: string; note?: string },
  ): Promise<{ queued: number; skipped: string[] }> {
    let organizationName: string | null = null;
    if (dto.organizationId) {
      const org = await this.organizations.findOne({
        where: { id: dto.organizationId, isActive: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
      organizationName = org.name;
    }

    const emails = [...new Set(dto.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    const skipped: string[] = [];
    let queued = 0;
    for (const email of emails) {
      const exists = await this.users.findOne({ where: { email } });
      if (exists) {
        skipped.push(email);
        continue;
      }
      await this.notifications.queueEmail({
        templateKey: 'corporate_invite',
        to: email,
        recipientType: 'bulk',
        context: {
          organizationName,
          note: dto.note?.trim() || null,
        },
      });
      queued += 1;
    }

    await this.audit.record(principal, {
      action: 'volunteer.invited',
      entity: 'volunteers',
      after: { organizationName, queued, skipped: skipped.length },
    });
    return { queued, skipped };
  }

  /**
   * The Welcome-Back email (client doc, Read to Rise phase 2/3): greets a
   * returning volunteer and re-allots them by showing their previous
   * community's upcoming sessions. Triggered automatically on reactivation;
   * also exposed for the admin's manual re-send.
   */
  async sendWelcomeBack(id: string): Promise<{ queued: number }> {
    const [row] = await this.dataSource.query(
      `SELECT v.id, v.first_name, u.email, u.is_active
       FROM volunteers v JOIN users u ON u.id = v.user_id WHERE v.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Volunteer not found');
    if (!row.is_active) {
      throw new BusinessException(
        'NOT_ELIGIBLE',
        'This volunteer is inactive — reactivate them first; the welcome-back email goes out automatically.',
        400,
      );
    }

    // Their previous community: the one behind their most recent enrollment
    // or attendance. NULL for volunteers with no history — the email adapts.
    const [prev] = await this.dataSource.query(
      `SELECT bc.id, bc.name
       FROM (
         SELECT en.event_id, en.enrolled_at AS at FROM event_enrollments en WHERE en.volunteer_id = $1
         UNION ALL
         SELECT ar.event_id, ar.recorded_at FROM attendance_records ar WHERE ar.volunteer_id = $1
       ) hist
       JOIN event_communities ec ON ec.event_id = hist.event_id
       JOIN beneficiary_communities bc ON bc.id = ec.community_id
       ORDER BY hist.at DESC LIMIT 1`,
      [id],
    );

    const sessions = prev
      ? await this.dataSource.query(
          `SELECT COALESCE(e.name, a.name) AS name, e.date
           FROM event_communities ec
           JOIN events e ON e.id = ec.event_id
           JOIN activities a ON a.id = e.activity_id
           WHERE ec.community_id = $1 AND e.status = 'upcoming' AND e.date >= CURRENT_DATE
           ORDER BY e.date LIMIT 3`,
          [prev.id],
        )
      : [];

    await this.notifications.queueEmail({
      templateKey: 'welcome_back',
      to: row.email,
      recipientType: 'volunteer',
      volunteerId: id,
      context: {
        firstName: row.first_name,
        communityName: prev?.name ?? null,
        upcomingCount: sessions.length,
        upcomingPlural: sessions.length !== 1,
        sessions: sessions.map((s: { name: string; date: string }) => ({
          name: s.name,
          date: new Date(`${s.date}T00:00:00`).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          }),
        })),
      },
    });
    return { queued: 1 };
  }
  /**
   * Data-lifecycle erasure: strip everything that identifies the person while
   * keeping the aggregates the foundation reports on (hours, attendance,
   * beneficiary numbers stay; the name on them goes). Irreversible by design.
   */
  async erase(principal: AuthPrincipal, id: string): Promise<{ erased: true }> {
    const volunteer = await this.volunteers.findOne({ where: { id }, relations: { user: true } });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    const short = id.replace(/-/g, '').slice(-8);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Volunteer, { id }, {
        firstName: 'Erased',
        lastName: `Volunteer-${short}`,
        phone: null,
        dateOfBirth: null,
        city: null,
        state: null,
        phase: 'Inactive',
      });
      await manager.update(User, { id: volunteer.userId }, {
        email: `erased-${short}@erased.invalid`,
        passwordHash: '',
        isActive: false,
      });
      // Kill every live session and pending link for this person.
      await manager.query('DELETE FROM refresh_tokens WHERE user_id = $1', [volunteer.userId]);
      await manager.query('DELETE FROM access_tokens WHERE volunteer_id = $1', [id]);
      // Free-text feedback may identify the author; ratings/tags are aggregates.
      await manager.query(
        `UPDATE feedback_submissions SET comments = NULL, went_well = NULL,
          went_wrong_detail = NULL, improvement_detail = NULL,
          is_published_testimonial = FALSE WHERE volunteer_id = $1`,
        [id],
      );
      // Their inbox history: keep the row (dispatch audit), drop the address/body.
      await manager.query(
        `UPDATE email_logs SET recipient_email = 'erased@erased.invalid',
          body_snapshot = NULL WHERE volunteer_id = $1`,
        [id],
      );
    });

    await this.audit.record(principal, {
      action: 'volunteer.erased',
      entity: 'volunteers',
      entityId: id,
      before: null,
      after: { erased: true },
    });

    return { erased: true };
  }
}
