import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import { Certificate, Volunteer } from '../../database/entities';
import { NotificationsService } from '../notifications';
import { SignedUrlService } from '../storage/signed-url.service';
import { StorageService } from '../storage/storage.service';
import { CertificatePdfService } from './certificate-pdf.service';

/**
   * The one place a certificate's file name is decided.
   *
   * The certificate number alone: it is already unique per certificate and
   * carries the year, so prefixing the volunteer's UUID only made a 60-character
   * file name that nobody could read at a glance.
   */
function certificateFileName(certificateNumber: string): string {
  return `${certificateNumber}.pdf`;
}

interface ParticipationRow {
  volunteer_id: string;
  program_id: string;
  events_attended: number;
  total_hours: string;
  first_attended_on: string | null;
  last_attended_on: string | null;
}

export interface CertificateCandidate {
  volunteerId: string;
  volunteerName: string;
  email: string;
  category: 'Individual' | 'CSR';
  organizationName: string | null;
  programId: string;
  programCode: string | null;
  programName: string;
  eventsAttended: number;
  hours: string;
  periodStart: string | null;
  periodEnd: string | null;
  certificate: {
    id: string;
    certificateNumber: string | null;
    issued: boolean;
    issuedAt: Date | null;
    resendCount: number;
    hours: string;
    /** True when attendance moved after issue — the printed figures are stale. */
    stale: boolean;
  } | null;
}

/**
 * BR-18: one certificate per volunteer per PROGRAMME; hours are summed across
 * every occurrence attended in it (v_program_participation is the only source).
 * BR-08: CSR volunteers get the corporate variant, carrying their organization.
 */
@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Certificate) private readonly certs: Repository<Certificate>,
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    private readonly pdf: CertificatePdfService,
    private readonly storage: StorageService,
    private readonly signer: SignedUrlService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Admin list — every (volunteer, programme) pair with attended hours, merged
   * with whatever certificate row already exists for it. "Eligible but not
   * issued" is a row with certificate: null or issued: false.
   */
  async candidates(filters: {
    q?: string;
    programId?: string;
    status?: 'issued' | 'pending';
  }): Promise<CertificateCandidate[]> {
    const rows: Array<ParticipationRow & Record<string, unknown>> = await this.dataSource.query(
      `SELECT pp.*, v.first_name, v.last_name, v.category,
              u.email, o.name AS organization_name,
              p.code AS program_code, p.name AS program_name,
              c.id AS cert_id, c.certificate_number, c.issued, c.issued_at,
              c.resend_count, c.hours AS cert_hours, c.events_attended AS cert_events
       FROM v_program_participation pp
       JOIN volunteers v ON v.id = pp.volunteer_id
       JOIN users u ON u.id = v.user_id
       LEFT JOIN organizations o ON o.id = v.organization_id
       JOIN programs p ON p.id = pp.program_id
       LEFT JOIN certificates c
         ON c.volunteer_id = pp.volunteer_id AND c.program_id = pp.program_id
       WHERE pp.events_attended > 0
         -- An erased volunteer's row is an anonymised husk; certifying it
         -- would print "Erased Volunteer-1a2b3c4d" on a formal document.
         AND u.email NOT LIKE '%@erased.invalid'
         AND ($1::uuid IS NULL OR pp.program_id = $1)
         AND ($2::text IS NULL OR
              v.first_name || ' ' || v.last_name ILIKE '%' || $2 || '%'
              OR u.email ILIKE '%' || $2 || '%'
              OR p.name ILIKE '%' || $2 || '%')
       ORDER BY p.name, v.first_name, v.last_name`,
      [filters.programId ?? null, filters.q || null],
    );

    const mapped = rows.map((r): CertificateCandidate => ({
      volunteerId: r.volunteer_id,
      volunteerName: `${r.first_name} ${r.last_name}`,
      email: String(r.email),
      category: r.category as 'Individual' | 'CSR',
      organizationName: (r.organization_name as string) ?? null,
      programId: r.program_id,
      programCode: (r.program_code as string) ?? null,
      programName: String(r.program_name),
      eventsAttended: r.events_attended,
      hours: String(r.total_hours),
      periodStart: r.first_attended_on,
      periodEnd: r.last_attended_on,
      certificate: r.cert_id
        ? {
            id: String(r.cert_id),
            certificateNumber: (r.certificate_number as string) ?? null,
            issued: Boolean(r.issued),
            issuedAt: (r.issued_at as Date) ?? null,
            resendCount: Number(r.resend_count),
            hours: String(r.cert_hours),
            stale:
              Boolean(r.issued) &&
              (Number(r.cert_events) !== r.events_attended ||
                Number(r.cert_hours) !== Number(r.total_hours)),
          }
        : null,
    }));

    if (filters.status === 'issued') return mapped.filter((m) => m.certificate?.issued);
    if (filters.status === 'pending') return mapped.filter((m) => !m.certificate?.issued);
    return mapped;
  }

  /**
   * Issue (or re-issue) the certificate for one volunteer in one programme:
   * recompute the figures, render the PDF, store it, and email it with the
   * document attached. Idempotent on the already-issued case unless reissue.
   */
  async issue(
    volunteerId: string,
    programId: string,
    issuedBy: string,
    opts: { reissue?: boolean; mementoNote?: string } = {},
  ): Promise<Certificate> {
    const participation = await this.participationOf(volunteerId, programId);
    if (!participation || participation.events_attended === 0) {
      throw new BusinessException(
        'NOT_ELIGIBLE',
        'No attended sessions in this programme — nothing to certify.',
        409,
      );
    }

    const volunteer = await this.volunteers.findOne({
      where: { id: volunteerId },
      relations: { user: true, organization: true },
    });
    if (!volunteer) throw new NotFoundException('Volunteer not found');

    const program: Array<{ name: string }> = await this.dataSource.query(
      `SELECT name FROM programs WHERE id = $1`,
      [programId],
    );
    if (program.length === 0) throw new NotFoundException('Programme not found');
    const programName = program[0].name;

    let cert = await this.certs.findOne({ where: { volunteerId, programId } });
    if (cert?.issued && !opts.reissue) {
      throw new BusinessException(
        'ALREADY_ISSUED',
        `Certificate ${cert.certificateNumber} already issued — use resend or reissue.`,
        409,
      );
    }

    // Number + figures inside one transaction; the advisory lock serialises
    // concurrent number assignment without a table lock.
    cert = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Certificate);
      let row = await repo.findOne({ where: { volunteerId, programId } });
      if (!row) {
        row = repo.create({ volunteerId, programId });
      }

      if (!row.certificateNumber) {
        await manager.query(`SELECT pg_advisory_xact_lock(hashtext('certificate_number'))`);
        const year = new Date().getFullYear();
        const [{ next }]: Array<{ next: string }> = await manager.query(
          `SELECT COALESCE(MAX(SUBSTRING(certificate_number FROM 10)::int), 0) + 1 AS next
           FROM certificates WHERE certificate_number LIKE $1`,
          [`PAR-${year}-%`],
        );
        row.certificateNumber = `PAR-${year}-${String(next).padStart(6, '0')}`;
      }

      row.hours = participation.total_hours;
      row.eventsAttended = participation.events_attended;
      row.periodStart = participation.first_attended_on;
      row.periodEnd = participation.last_attended_on;
      row.certType = volunteer.category === 'CSR' ? 'corporate' : 'individual';
      row.organizationId = volunteer.organizationId;
      row.issued = true;
      row.issuedAt = new Date();
      row.issuedBy = issuedBy;
      // The Exposure Visit "tangible gift" record (client doc): noted at issue
      // time, mentioned in the email; the handover itself stays offline.
      if (opts.mementoNote !== undefined) row.mementoNote = opts.mementoNote.trim() || null;

      return repo.save(row);
    });

    // Render AFTER the row is final so the PDF prints the stored figures.
    const pdfBytes = await this.pdf.render({
      certificateNumber: cert.certificateNumber!,
      volunteerName: volunteer.fullName,
      programName,
      hours: this.fmtHours(cert.hours),
      eventsAttended: cert.eventsAttended,
      periodStart: cert.periodStart,
      periodEnd: cert.periodEnd,
      certType: cert.certType,
      organizationName: volunteer.organization?.name ?? null,
      issuedOn: cert.issuedAt!.toISOString(),
    });

    // <volunteerId>-<certificateNumber>: traceable to a person and unique per
    // certificate, so a downloaded file is identifiable without opening it.
    const previousPath = cert.filePath;
    const filePath = `certificates/${certificateFileName(cert.certificateNumber!)}`;
    await this.storage.put(filePath, pdfBytes);
    await this.certs.update({ id: cert.id }, { filePath });
    cert.filePath = filePath;

    // A reissue that lands on a new path (older certificates were named
    // differently) leaves the superseded PDF behind — delete it, or storage
    // slowly fills with files nothing references. delete() only warns on
    // failure, so a missing file cannot break the reissue.
    if (previousPath && previousPath !== filePath) {
      await this.storage.delete(previousPath);
    }

    await this.sendCertificateEmail(cert, volunteer, programName);
    this.logger.log(`Issued ${cert.certificateNumber} to ${volunteer.fullName} (${programName})`);
    return cert;
  }

  async issueBulk(
    programId: string,
    issuedBy: string,
  ): Promise<{ issued: number; skipped: number; failures: Array<{ volunteerId: string; error: string }> }> {
    const pending = (await this.candidates({ programId, status: 'pending' })).filter(
      (c) => c.eventsAttended > 0,
    );

    let issued = 0;
    const failures: Array<{ volunteerId: string; error: string }> = [];
    for (const candidate of pending) {
      try {
        await this.issue(candidate.volunteerId, programId, issuedBy);
        issued += 1;
      } catch (err) {
        failures.push({ volunteerId: candidate.volunteerId, error: (err as Error).message });
      }
    }
    return { issued, skipped: failures.length, failures };
  }

  /** Reissue by certificate id: recompute figures, re-render, re-send. */
  async reissueById(certificateId: string, issuedBy: string): Promise<Certificate> {
    const cert = await this.certs.findOne({ where: { id: certificateId } });
    if (!cert) throw new NotFoundException('Certificate not found');
    return this.issue(cert.volunteerId, cert.programId, issuedBy, { reissue: true });
  }

  /** Resend the exact document already on file — no recompute (that is reissue). */
  async resend(certificateId: string): Promise<Certificate> {
    const cert = await this.certs.findOne({
      where: { id: certificateId },
      relations: { volunteer: { user: true, organization: true }, program: true },
    });
    if (!cert || !cert.issued || !cert.filePath) {
      throw new NotFoundException('No issued certificate to resend');
    }

    await this.sendCertificateEmail(cert, cert.volunteer, cert.program.name);
    await this.certs.update({ id: cert.id }, { resendCount: cert.resendCount + 1 });
    cert.resendCount += 1;
    return cert;
  }

  /** The volunteer's wallet. */
  async mine(userId: string): Promise<Array<Record<string, unknown>>> {
    const volunteer = await this.volunteers.findOne({ where: { userId } });
    if (!volunteer) return [];

    const rows = await this.certs.find({
      where: { volunteerId: volunteer.id, issued: true },
      relations: { program: true },
      order: { issuedAt: 'DESC' },
    });

    return rows.map((c) => ({
      id: c.id,
      certificateNumber: c.certificateNumber,
      programName: c.program.name,
      hours: this.fmtHours(c.hours),
      eventsAttended: c.eventsAttended,
      periodStart: c.periodStart,
      periodEnd: c.periodEnd,
      certType: c.certType,
      issuedAt: c.issuedAt,
    }));
  }

  /** Admin, or the volunteer the certificate belongs to. */
  async download(
    certificateId: string,
    principal: { sub: string; role: 'admin' | 'volunteer' },
  ): Promise<{ data: Buffer; filename: string }> {
    const cert = await this.certs.findOne({ where: { id: certificateId } });
    if (!cert || !cert.issued || !cert.filePath) {
      throw new NotFoundException('Certificate not found');
    }

    if (principal.role !== 'admin') {
      const volunteer = await this.volunteers.findOne({ where: { userId: principal.sub } });
      if (!volunteer || volunteer.id !== cert.volunteerId) {
        throw new NotFoundException('Certificate not found');
      }
    }

    return {
      data: await this.storage.get(cert.filePath),
      filename: certificateFileName(cert.certificateNumber!),
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async participationOf(
    volunteerId: string,
    programId: string,
  ): Promise<ParticipationRow | null> {
    const rows: ParticipationRow[] = await this.dataSource.query(
      `SELECT * FROM v_program_participation WHERE volunteer_id = $1 AND program_id = $2`,
      [volunteerId, programId],
    );
    return rows[0] ?? null;
  }

  private async sendCertificateEmail(
    cert: Certificate,
    volunteer: Volunteer,
    programName: string,
  ): Promise<void> {
    await this.notifications.queueEmail({
      templateKey: 'certificate_issued',
      to: volunteer.user.email,
      recipientType: 'volunteer',
      programId: cert.programId,
      volunteerId: cert.volunteerId,
      context: {
        firstName: volunteer.firstName,
        programName,
        certificateNumber: cert.certificateNumber,
        hours: this.fmtHours(cert.hours),
        eventsAttended: cert.eventsAttended,
        mementoNote: cert.mementoNote,
      },
      attachmentUrl: this.signer.internalUrl(
        cert.filePath!,
        certificateFileName(cert.certificateNumber!),
      ),
      attachmentName: certificateFileName(cert.certificateNumber!),
    });
  }

  private fmtHours(hours: string): string {
    const n = Number(hours);
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '');
  }
}
