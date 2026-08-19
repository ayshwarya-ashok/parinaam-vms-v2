import { Injectable, NotFoundException } from '@nestjs/common';
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
import { RegisterVolunteerDto, SignConsentDto, UpdateProfileDto } from './volunteers.dto';

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
  ) {}

  // ── Registration (profile completion after signup) ────────────────────────

  async register(principal: AuthPrincipal, dto: RegisterVolunteerDto): Promise<Volunteer> {
    const existing = await this.volunteers.findOne({ where: { userId: principal.sub } });
    if (existing) {
      throw new BusinessException(
        'ALREADY_REGISTERED',
        'Your volunteer profile already exists.',
        409,
      );
    }

    // BR-01 — enforced by the DB constraint too, but a named error beats a
    // constraint violation at the form.
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

    if (dto.organizationId) {
      const org = await this.organizations.findOne({
        where: { id: dto.organizationId, isActive: true },
      });
      if (!org) throw new NotFoundException('Organization not found');
    }

    const saved = await this.volunteers.save(
      this.volunteers.create({
        userId: principal.sub,
        firstName: dto.firstName,
        lastName: dto.lastName,
        gender: (dto.gender as Volunteer['gender']) ?? null,
        dateOfBirth: dto.dateOfBirth ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        phone: dto.phone ?? null,
        category: dto.category,
        organizationId: dto.organizationId ?? null,
        skills: dto.skills ?? null,
        complianceRead: dto.complianceRead,
      }),
    );

    await this.audit.record(principal, {
      action: 'volunteer.registered',
      entity: 'volunteers',
      entityId: saved.id,
      after: { category: saved.category, city: saved.city },
    });

    return saved;
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
      qb.andWhere(
        '(v.firstName ILIKE :q OR v.lastName ILIKE :q OR u.email::text ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }
    if (query.phase) qb.andWhere('v.phase = :phase', { phase: query.phase });
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
        createdAt: v.createdAt,
      })),
      meta: { total, limit, offset },
    };
  }

  async adminGet(id: string) {
    const volunteer = await this.volunteers.findOne({
      where: { id },
      relations: { user: true, organization: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found');
    const consent = await this.consents.findOne({ where: { volunteerId: id } });
    return { ...volunteer, email: volunteer.user?.email, consentSigned: consent !== null };
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

    return this.adminGet(id);
  }
}
