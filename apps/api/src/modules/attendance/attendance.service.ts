import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sharp from 'sharp';
import { DataSource, IsNull, Repository } from 'typeorm';
import { BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import {
  AccessToken,
  AttendanceDispatch,
  AttendanceRecord,
  EventPhoto,
  EventReport,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../../config';
import { NotificationsService, TemplateService } from '../notifications';
import { StorageService } from '../storage/storage.service';
import { LinkTokenService } from './link-token.service';

const MAX_EVIDENCE_IMAGES = 2;

export interface UploadedImage {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

export interface VolunteerSubmission {
  attended: boolean;
  arrivalTime?: string;
  departureTime?: string;
  notes?: string;
  absenceReason?: string;
  absenceDetail?: string;
}

export interface CoordinatorSubmission {
  status: 'completed' | 'partial' | 'postponed' | 'cancelled';
  actualStartTime?: string;
  actualEndTime?: string;
  volunteersPresent: number;
  beneficiariesReached: number;
  highlights?: string;
  challenges?: string;
  notes?: string;
}

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(AttendanceDispatch) private readonly dispatches: Repository<AttendanceDispatch>,
    @InjectRepository(AttendanceRecord) private readonly records: Repository<AttendanceRecord>,
    @InjectRepository(EventReport) private readonly reports: Repository<EventReport>,
    @InjectRepository(EventPhoto) private readonly photos: Repository<EventPhoto>,
    private readonly dataSource: DataSource,
    private readonly linkTokens: LinkTokenService,
    private readonly notifications: NotificationsService,
    private readonly templates: TemplateService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  // ── Field execution table ───────────────────────────────────────────────────

  async dispatchList(query: { q?: string; programId?: string; sendStatus?: string }) {
    const rows = await this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS name, e.date, e.start_time,
              e.location, e.status,
              p.id AS program_id, p.name AS program_name,
              c.name AS coordinator_name, c.email AS coordinator_email,
              d.volunteer_email_sent, d.volunteer_email_sent_at, d.volunteer_send_count,
              d.coordinator_email_sent, d.coordinator_email_sent_at, d.coordinator_send_count,
              cap.enrolled_count,
              (SELECT COUNT(*)::int FROM attendance_records ar WHERE ar.event_id = e.id) AS submitted_count,
              (SELECT COUNT(*)::int FROM attendance_records ar WHERE ar.event_id = e.id AND ar.attended) AS attended_count,
              (SELECT COUNT(*)::int FROM event_reports er WHERE er.event_id = e.id) > 0 AS report_submitted
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN coordinators c ON c.id = e.coordinator_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       LEFT JOIN attendance_dispatches d ON d.event_id = e.id
       WHERE e.status IN ('upcoming', 'inprogress', 'completed')
         AND ($1::text IS NULL OR COALESCE(e.name, a.name) ILIKE $1 OR p.name ILIKE $1)
         AND ($2::uuid IS NULL OR p.id = $2)
       ORDER BY e.date DESC, e.start_time DESC
       LIMIT 200`,
      [query.q ? `%${query.q}%` : null, query.programId ?? null],
    );

    let mapped = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      date: r.date,
      startTime: String(r.start_time).slice(0, 5),
      location: r.location,
      status: r.status,
      program: { id: r.program_id, name: r.program_name },
      coordinator: { name: r.coordinator_name, email: r.coordinator_email },
      volunteerEmail: {
        sent: r.volunteer_email_sent === true,
        sentAt: r.volunteer_email_sent_at,
        count: Number(r.volunteer_send_count ?? 0),
      },
      coordinatorEmail: {
        sent: r.coordinator_email_sent === true,
        sentAt: r.coordinator_email_sent_at,
        count: Number(r.coordinator_send_count ?? 0),
      },
      enrolled: Number(r.enrolled_count),
      submitted: Number(r.submitted_count),
      attended: Number(r.attended_count),
      reportSubmitted: r.report_submitted === true,
    }));

    if (query.sendStatus === 'pending') {
      mapped = mapped.filter(
        (m: { volunteerEmail: { sent: boolean }; coordinatorEmail: { sent: boolean } }) =>
          !m.volunteerEmail.sent && !m.coordinatorEmail.sent,
      );
    } else if (query.sendStatus === 'sent') {
      mapped = mapped.filter(
        (m: { volunteerEmail: { sent: boolean }; coordinatorEmail: { sent: boolean } }) =>
          m.volunteerEmail.sent || m.coordinatorEmail.sent,
      );
    }
    return { data: mapped };
  }

  // ── Dispatch ────────────────────────────────────────────────────────────────

  private async eventContext(eventId: string) {
    const [event] = await this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS display_name, e.date, e.start_time,
              e.duration_hours, e.location, e.coordinator_id, a.program_id,
              c.name AS coordinator_name, c.email AS coordinator_email
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN coordinators c ON c.id = e.coordinator_id
       WHERE e.id = $1`,
      [eventId],
    );
    if (!event) throw new NotFoundException('Session not found');
    return event;
  }

  async preview(eventId: string, target: 'volunteer' | 'coordinator') {
    const event = await this.eventContext(eventId);
    const context = this.mailContext(event, '#(a unique secure link per recipient)');
    const key = target === 'volunteer' ? 'attendance_volunteer' : 'attendance_coordinator';
    const rendered = this.templates.render(key, {
      ...context,
      firstName: target === 'volunteer' ? 'Volunteer' : event.coordinator_name,
    });
    const recipients =
      target === 'volunteer'
        ? (
            await this.dataSource.query(
              `SELECT COUNT(*)::int AS n FROM event_enrollments WHERE event_id = $1 AND status = 'enrolled'`,
              [eventId],
            )
          )[0].n
        : 1;
    return { subject: rendered.subject, html: rendered.html, recipients: Number(recipients) };
  }

  async dispatch(
    principal: AuthPrincipal,
    eventId: string,
    target: 'volunteer' | 'coordinator' | 'both',
  ) {
    const event = await this.eventContext(eventId);
    let volunteersSent = 0;
    let coordinatorSent = false;

    if (target === 'volunteer' || target === 'both') {
      const enrolled = await this.dataSource.query(
        `SELECT v.id AS volunteer_id, v.first_name, u.email
         FROM event_enrollments en
         JOIN volunteers v ON v.id = en.volunteer_id
         JOIN users u ON u.id = v.user_id
         WHERE en.event_id = $1 AND en.status = 'enrolled'`,
        [eventId],
      );
      for (const r of enrolled) {
        // One token per recipient — the link identifies both the occurrence
        // and the person, so the form needs no login and no name entry.
        const { raw } = await this.linkTokens.issue({
          purpose: 'volunteer_attendance',
          eventId,
          volunteerId: r.volunteer_id,
          subjectEmail: r.email,
          createdBy: principal.sub,
        });
        await this.notifications.queueEmail({
          templateKey: 'attendance_volunteer',
          to: r.email,
          recipientType: 'volunteer',
          volunteerId: r.volunteer_id,
          eventId,
          programId: event.program_id,
          context: {
            ...this.mailContext(event, `${this.config.get('PUBLIC_WEB_URL')}/attendance/${raw}`),
            firstName: r.first_name,
          },
        });
        volunteersSent++;
      }
    }

    if (target === 'coordinator' || target === 'both') {
      const { raw } = await this.linkTokens.issue({
        purpose: 'coordinator_report',
        eventId,
        coordinatorId: event.coordinator_id,
        subjectEmail: event.coordinator_email,
        createdBy: principal.sub,
      });
      await this.notifications.queueEmail({
        templateKey: 'attendance_coordinator',
        to: event.coordinator_email,
        recipientType: 'coordinator',
        coordinatorId: event.coordinator_id,
        eventId,
        programId: event.program_id,
        context: {
          ...this.mailContext(event, `${this.config.get('PUBLIC_WEB_URL')}/report/${raw}`),
          firstName: event.coordinator_name,
        },
      });
      coordinatorSent = true;
    }

    // Upsert the dispatch state the field-execution table shows.
    await this.dataSource.query(
      `INSERT INTO attendance_dispatches
         (event_id, volunteer_email_sent, volunteer_email_sent_at, volunteer_send_count,
          coordinator_email_sent, coordinator_email_sent_at, coordinator_send_count, last_dispatched_by)
       VALUES ($1, $2, CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN 1 ELSE 0 END,
               $3, CASE WHEN $3 THEN now() END, CASE WHEN $3 THEN 1 ELSE 0 END, $4)
       ON CONFLICT (event_id) DO UPDATE SET
         volunteer_email_sent = attendance_dispatches.volunteer_email_sent OR EXCLUDED.volunteer_email_sent,
         volunteer_email_sent_at = COALESCE(EXCLUDED.volunteer_email_sent_at, attendance_dispatches.volunteer_email_sent_at),
         volunteer_send_count = attendance_dispatches.volunteer_send_count + EXCLUDED.volunteer_send_count,
         coordinator_email_sent = attendance_dispatches.coordinator_email_sent OR EXCLUDED.coordinator_email_sent,
         coordinator_email_sent_at = COALESCE(EXCLUDED.coordinator_email_sent_at, attendance_dispatches.coordinator_email_sent_at),
         coordinator_send_count = attendance_dispatches.coordinator_send_count + EXCLUDED.coordinator_send_count,
         last_dispatched_by = EXCLUDED.last_dispatched_by`,
      [eventId, volunteersSent > 0, coordinatorSent, principal.sub],
    );

    return { volunteersSent, coordinatorSent };
  }

  private mailContext(event: Record<string, string>, link: string) {
    return {
      eventName: event.display_name,
      eventDate: fmtDate(event.date),
      eventTime: String(event.start_time).slice(0, 5),
      location: event.location ?? 'to be confirmed',
      link,
      linkTtlDays: 7,
    };
  }

  // ── Link-token form context ─────────────────────────────────────────────────

  async volunteerFormContext(rawToken: string) {
    const token = await this.linkTokens.verify(rawToken, 'volunteer_attendance');
    const event = await this.eventContext(token.eventId!);
    const [volunteer] = await this.dataSource.query(
      'SELECT first_name, last_name FROM volunteers WHERE id = $1',
      [token.volunteerId],
    );
    const existing = await this.records.findOne({
      where: { eventId: token.eventId!, volunteerId: token.volunteerId! },
    });
    return {
      event: {
        name: event.display_name,
        date: event.date,
        startTime: String(event.start_time).slice(0, 5),
        durationHours: event.duration_hours,
        location: event.location,
      },
      volunteerName: volunteer ? `${volunteer.first_name} ${volunteer.last_name}` : '',
      alreadySubmitted: existing !== null,
    };
  }

  async coordinatorFormContext(rawToken: string) {
    const token = await this.linkTokens.verify(rawToken, 'coordinator_report');
    const event = await this.eventContext(token.eventId!);
    const existing = await this.reports.findOne({ where: { eventId: token.eventId! } });
    const [cap] = await this.dataSource.query(
      'SELECT enrolled_count FROM v_event_capacity WHERE event_id = $1',
      [token.eventId],
    );
    return {
      event: {
        name: event.display_name,
        date: event.date,
        startTime: String(event.start_time).slice(0, 5),
        durationHours: event.duration_hours,
        location: event.location,
      },
      coordinatorName: event.coordinator_name,
      enrolledCount: Number(cap?.enrolled_count ?? 0),
      alreadySubmitted: existing !== null,
    };
  }

  // ── Submissions ─────────────────────────────────────────────────────────────

  async submitVolunteer(rawToken: string, dto: VolunteerSubmission, images: UploadedImage[]) {
    const { token } = await this.linkTokens.verifyForSubmit(rawToken, 'volunteer_attendance');

    // BR-15, mirrored ahead of the check constraints for named errors.
    if (dto.attended && (!dto.arrivalTime || !dto.departureTime)) {
      throw new BusinessException(
        'TIMES_REQUIRED',
        'Arrival and departure times are required when you attended.',
        400,
      );
    }
    if (!dto.attended && !dto.absenceReason) {
      throw new BusinessException(
        'REASON_REQUIRED',
        'Please pick a reason for your absence.',
        400,
      );
    }

    const hours = dto.attended ? this.hoursBetween(dto.arrivalTime!, dto.departureTime!) : null;

    const record = await this.dataSource.transaction(async (mgr) => {
      const existing = await mgr.findOne(AttendanceRecord, {
        where: { eventId: token.eventId!, volunteerId: token.volunteerId! },
      });

      const values = {
        attended: dto.attended,
        arrivalTime: dto.attended ? dto.arrivalTime! : null,
        departureTime: dto.attended ? dto.departureTime! : null,
        hoursContributed: hours !== null ? String(hours) : null,
        absenceReason: dto.attended ? null : (dto.absenceReason as AttendanceRecord['absenceReason']),
        absenceDetail: dto.attended ? null : (dto.absenceDetail ?? null),
        notes: dto.notes ?? null,
        source: 'self' as const,
      };

      if (existing) {
        // Grace-window resubmission updates rather than duplicating.
        Object.assign(existing, values);
        return mgr.save(existing);
      }
      return mgr.save(
        mgr.create(AttendanceRecord, {
          eventId: token.eventId!,
          volunteerId: token.volunteerId!,
          ...values,
        }),
      );
    });

    await this.storeEvidence(images, token, { attendanceRecordId: record.id, source: 'volunteer_attendance' });

    return { submitted: true, hoursContributed: record.hoursContributed };
  }

  async submitCoordinator(rawToken: string, dto: CoordinatorSubmission, images: UploadedImage[]) {
    const { token } = await this.linkTokens.verifyForSubmit(rawToken, 'coordinator_report');

    const report = await this.dataSource.transaction(async (mgr) => {
      const existing = await mgr.findOne(EventReport, { where: { eventId: token.eventId! } });
      const values = {
        coordinatorId: token.coordinatorId,
        status: dto.status,
        actualStartTime: dto.actualStartTime ?? null,
        actualEndTime: dto.actualEndTime ?? null,
        volunteersPresent: dto.volunteersPresent,
        beneficiariesReached: dto.beneficiariesReached,
        highlights: dto.highlights ?? null,
        challenges: dto.challenges ?? null,
        notes: dto.notes ?? null,
        submittedViaToken: token.id,
      };
      if (existing) {
        Object.assign(existing, values);
        return mgr.save(existing);
      }
      return mgr.save(mgr.create(EventReport, { eventId: token.eventId!, ...values }));
    });

    await this.storeEvidence(images, token, { eventReportId: report.id, source: 'coordinator_report' });

    return { submitted: true };
  }

  private async storeEvidence(
    images: UploadedImage[],
    token: AccessToken,
    link: { attendanceRecordId?: string; eventReportId?: string; source: EventPhoto['source'] },
  ): Promise<void> {
    for (const image of images.slice(0, MAX_EVIDENCE_IMAGES)) {
      if (!/^image\/(jpeg|png|webp)$/.test(image.mimetype)) {
        throw new BusinessException('UNSUPPORTED_FILE_TYPE', 'Images must be JPEG, PNG or WebP.', 400);
      }
      try {
        // rotate() applies EXIF orientation, then re-encoding strips ALL
        // metadata — GPS coordinates in a field photo are a privacy leak.
        const cleaned = await sharp(image.buffer).rotate().jpeg({ quality: 85 }).toBuffer();
        const thumb = await sharp(cleaned).resize({ width: 320 }).jpeg({ quality: 70 }).toBuffer();

        const path = this.storage.buildPath(`evidence/${token.eventId}`, 'jpg');
        const stored = await this.storage.put(path, cleaned);
        const thumbStored = await this.storage.put(path.replace('.jpg', '.thumb.jpg'), thumb);

        await this.photos.save(
          this.photos.create({
            eventId: token.eventId!,
            attendanceRecordId: link.attendanceRecordId ?? null,
            eventReportId: link.eventReportId ?? null,
            filePath: stored.path,
            thumbnailPath: thumbStored.path,
            mimeType: 'image/jpeg',
            fileSizeBytes: String(stored.sizeBytes),
            source: link.source,
            isPublic: false,
          }),
        );
      } catch (err) {
        // A corrupt image must not lose the attendance submission itself.
        this.logger.warn(`Evidence image rejected: ${(err as Error).message}`);
      }
    }
  }

  private hoursBetween(arrival: string, departure: string): number {
    const [ah, am] = arrival.split(':').map(Number);
    const [dh, dm] = departure.split(':').map(Number);
    const minutes = dh * 60 + dm - (ah * 60 + am);
    return Math.max(0, Math.round((minutes / 60) * 100) / 100);
  }

  // ── Admin views and overrides ───────────────────────────────────────────────

  async recordsOf(eventId: string) {
    return this.dataSource.query(
      `SELECT ar.id, ar.attended, ar.arrival_time, ar.departure_time, ar.hours_contributed,
              ar.absence_reason, ar.absence_detail, ar.notes, ar.source, ar.recorded_at,
              v.id AS volunteer_id, v.first_name, v.last_name, u.email,
              (SELECT COUNT(*)::int FROM event_photos ph WHERE ph.attendance_record_id = ar.id) AS photo_count
       FROM attendance_records ar
       JOIN volunteers v ON v.id = ar.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE ar.event_id = $1
       ORDER BY v.first_name`,
      [eventId],
    );
  }

  async reportOf(eventId: string) {
    const report = await this.reports.findOne({
      where: { eventId },
      relations: { coordinator: true },
    });
    const photos = report
      ? await this.photos.find({ where: { eventReportId: report.id } })
      : [];
    return { report, photos };
  }

  /**
   * Everything the admin session-record screen shows, in one request: the
   * occurrence, the enrolled ROSTER (not just those who submitted), whatever
   * each volunteer or the coordinator logged, and the occurrence report.
   *
   * The roster is the left join that matters — a volunteer who never filed
   * anything is exactly who the admin is looking for, and querying
   * attendance_records alone would hide them.
   */
  async sessionRecord(eventId: string) {
    const [event] = await this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS name, e.date, e.start_time,
              e.duration_hours, e.location, e.city, e.status, e.max_slots,
              e.cancel_reason,
              a.id AS activity_id, a.name AS activity_name,
              p.id AS program_id, p.name AS program_name,
              c.id AS coordinator_id, c.name AS coordinator_name, c.email AS coordinator_email,
              d.volunteer_email_sent, d.volunteer_email_sent_at,
              d.coordinator_email_sent, d.coordinator_email_sent_at
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       LEFT JOIN coordinators c ON c.id = e.coordinator_id
       LEFT JOIN attendance_dispatches d ON d.event_id = e.id
       WHERE e.id = $1`,
      [eventId],
    );
    if (!event) throw new NotFoundException('Session not found');

    const roster = await this.dataSource.query(
      `SELECT v.id AS volunteer_id, v.first_name, v.last_name, u.email, v.phone,
              en.status AS enrollment_status, en.enrolled_at,
              en.skills AS enrollment_skills, en.promoted_from_waitlist,
              ar.id AS record_id, ar.attended, ar.arrival_time, ar.departure_time,
              ar.hours_contributed, ar.absence_reason, ar.absence_detail, ar.notes,
              ar.source, ar.recorded_at,
              (SELECT COUNT(*)::int FROM event_photos ph
                WHERE ph.attendance_record_id = ar.id) AS photo_count
       FROM event_enrollments en
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       LEFT JOIN attendance_records ar
         ON ar.event_id = en.event_id AND ar.volunteer_id = v.id AND ar.phase_id IS NULL
       WHERE en.event_id = $1 AND en.status = 'enrolled'
       UNION
       -- Anyone with a record but no live enrolment (withdrew after attending;
       -- enrolment rows only ever read 'enrolled' or 'cancelled').
       SELECT v.id, v.first_name, v.last_name, u.email, v.phone,
              NULL, NULL, NULL, NULL,
              ar.id, ar.attended, ar.arrival_time, ar.departure_time,
              ar.hours_contributed, ar.absence_reason, ar.absence_detail, ar.notes,
              ar.source, ar.recorded_at,
              (SELECT COUNT(*)::int FROM event_photos ph
                WHERE ph.attendance_record_id = ar.id)
       FROM attendance_records ar
       JOIN volunteers v ON v.id = ar.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE ar.event_id = $1 AND ar.phase_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM event_enrollments en2
           WHERE en2.event_id = $1 AND en2.volunteer_id = v.id
             AND en2.status = 'enrolled')
       ORDER BY 2, 3`,
      [eventId],
    );

    const waitlist = await this.dataSource.query(
      `SELECT w.position, w.added_at, v.id AS volunteer_id, v.first_name, v.last_name, u.email
       FROM waitlist_entries w
       JOIN volunteers v ON v.id = w.volunteer_id
       JOIN users u ON u.id = v.user_id
       WHERE w.event_id = $1
       ORDER BY w.position`,
      [eventId],
    );

    const { report, photos } = await this.reportOf(eventId);

    const phases = await this.dataSource.query(
      `SELECT ph.*, v.first_name AS lead_first_name, v.last_name AS lead_last_name
       FROM event_phases ph
       LEFT JOIN volunteers v ON v.id = ph.partner_lead_volunteer_id
       WHERE ph.event_id = $1
       ORDER BY ph.sort_order, ph.start_date, ph.created_at`,
      [eventId],
    );

    // Visit-level rows (phased sessions): one per volunteer per phase per day.
    const visits = await this.dataSource.query(
      `SELECT ar.id, ar.phase_id, ar.visit_date, ar.hours_contributed, ar.notes,
              ar.volunteer_id, v.first_name, v.last_name
       FROM attendance_records ar
       JOIN volunteers v ON v.id = ar.volunteer_id
       WHERE ar.event_id = $1 AND ar.phase_id IS NOT NULL
       ORDER BY ar.visit_date, v.first_name`,
      [eventId],
    );

    return {
      event,
      roster,
      waitlist,
      report,
      photos,
      phases,
      visits,
      summary: {
        enrolled: roster.filter((r: { enrollment_status: string | null }) => r.enrollment_status !== null).length,
        submitted: roster.filter((r: { record_id: string | null }) => r.record_id !== null).length,
        // A volunteer counts as attended with a present session record OR any visit.
        attended: new Set([
          ...roster
            .filter((r: { attended: boolean | null }) => r.attended === true)
            .map((r: { volunteer_id: string }) => r.volunteer_id),
          ...visits.map((v: { volunteer_id: string }) => v.volunteer_id),
        ]).size,
        totalHours:
          roster.reduce(
            (sum: number, r: { attended: boolean | null; hours_contributed: string | null }) =>
              sum + (r.attended ? Number(r.hours_contributed ?? 0) : 0),
            0,
          ) +
          visits.reduce(
            (sum: number, v: { hours_contributed: string | null }) =>
              sum + Number(v.hours_contributed ?? 0),
            0,
          ),
      },
    };
  }

  /**
   * Log attendance for a volunteer who never submitted the form.
   *
   * Upsert rather than insert: an admin clicking twice, or correcting a row
   * that arrived between page load and save, must not create a second record
   * for the same (event, volunteer).
   */
  async adminRecord(
    principal: AuthPrincipal,
    eventId: string,
    dto: {
      volunteerId: string;
      attended: boolean;
      hoursContributed?: number;
      notes?: string;
      absenceReason?: string;
      /** Explicit flag for someone who was never enrolled but showed up. */
      walkIn?: boolean;
    },
  ) {
    const existing = await this.records.findOne({
      where: { eventId, volunteerId: dto.volunteerId, phaseId: IsNull() },
    });
    if (existing) {
      return this.adminOverride(principal, existing.id, dto as never);
    }

    /*
     * A new record needs a reason to exist. Either the volunteer was enrolled
     * (the normal case), or the admin explicitly says this is a walk-in — an
     * arbitrary volunteerId in a URL must not be enough to put hours on
     * somebody's record. Walk-ins must also be people the foundation would
     * let through the door: an approved registration on an active account.
     */
    const [enrollment] = await this.dataSource.query(
      `SELECT 1 FROM event_enrollments WHERE event_id = $1 AND volunteer_id = $2 AND status = 'enrolled'`,
      [eventId, dto.volunteerId],
    );
    if (!enrollment) {
      if (!dto.walkIn) {
        throw new BusinessException(
          'NOT_ENROLLED',
          'This volunteer is not enrolled in the session. Mark them as a walk-in to record their attendance anyway.',
          400,
        );
      }
      const [eligible] = await this.dataSource.query(
        `SELECT 1 FROM volunteers v JOIN users u ON u.id = v.user_id
         WHERE v.id = $1 AND u.is_active AND v.registration_status = 'approved'`,
        [dto.volunteerId],
      );
      if (!eligible) {
        throw new BusinessException(
          'WALKIN_NOT_ELIGIBLE',
          'Walk-ins must be active, approved volunteers.',
          400,
        );
      }
    }

    if (dto.attended && dto.hoursContributed === undefined) {
      throw new BusinessException(
        'HOURS_REQUIRED',
        'Enter the hours contributed when marking a volunteer present.',
        400,
      );
    }

    const saved = await this.records.save(
      this.records.create({
        eventId,
        volunteerId: dto.volunteerId,
        attended: dto.attended,
        hoursContributed: dto.attended ? String(dto.hoursContributed) : '0',
        notes: dto.notes ?? null,
        absenceReason: dto.attended
          ? null
          : ((dto.absenceReason as AttendanceRecord['absenceReason']) ?? null),
        source: 'admin',
        recordedBy: principal.sub,
      }),
    );

    await this.audit.record(principal, {
      action: 'attendance.admin_recorded',
      entity: 'attendance_records',
      entityId: saved.id,
      after: { volunteerId: dto.volunteerId, attended: saved.attended, hours: saved.hoursContributed },
    });
    return saved;
  }

  async adminOverride(
    principal: AuthPrincipal,
    recordId: string,
    dto: Partial<VolunteerSubmission> & { hoursContributed?: number },
  ) {
    const record = await this.records.findOneBy({ id: recordId });
    if (!record) throw new NotFoundException('Attendance record not found');

    const before = { attended: record.attended, hours: record.hoursContributed };
    Object.assign(record, {
      ...(dto.attended !== undefined && { attended: dto.attended }),
      ...(dto.hoursContributed !== undefined && { hoursContributed: String(dto.hoursContributed) }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.absenceReason !== undefined && {
        absenceReason: dto.absenceReason as AttendanceRecord['absenceReason'],
      }),
      source: 'admin' as const,
      recordedBy: principal.sub,
    });

    /*
     * The two attendance states clean up after each other.
     *
     * Present clears the absence fields — the DB refuses attended=true with an
     * absence_reason still set, so without this an admin who marked someone
     * absent by mistake could never mark them present again. Absent zeroes the
     * hours and times — the edit dialog carries whatever value was last on
     * screen, and hours from a session somebody missed must not survive into
     * their certificate totals.
     */
    if (record.attended) {
      record.absenceReason = null;
      record.absenceDetail = null;
      if (record.hoursContributed === null) {
        throw new BusinessException(
          'HOURS_REQUIRED',
          'Enter the hours contributed when marking a volunteer present.',
          400,
        );
      }
    } else {
      record.hoursContributed = '0';
      record.arrivalTime = null;
      record.departureTime = null;
    }

    const saved = await this.records.save(record);

    await this.audit.record(principal, {
      action: 'attendance.admin_override',
      entity: 'attendance_records',
      entityId: recordId,
      before,
      after: { attended: saved.attended, hours: saved.hoursContributed },
    });
    return saved;
  }

  // ── Visit-level attendance (phased sessions, client decision Q2) ───────────

  /**
   * One visit = one attendance record: (volunteer, phase, day), always
   * present, hours required. A volunteer's session total is the sum of every
   * visit across every phase — which is exactly what certificates read.
   * Logging a visit on a phase nobody started implies work began, so an
   * upcoming phase flips to inprogress (and the session follows).
   */
  async recordVisit(
    principal: AuthPrincipal,
    phaseId: string,
    dto: {
      volunteerId: string;
      visitDate: string;
      hoursContributed: number;
      notes?: string;
      walkIn?: boolean;
    },
  ) {
    const [phase] = await this.dataSource.query(
      `SELECT ph.id, ph.event_id, ph.name, ph.status, ph.start_date, ph.end_date
       FROM event_phases ph WHERE ph.id = $1`,
      [phaseId],
    );
    if (!phase) throw new NotFoundException('Phase not found');

    if (dto.visitDate < String(phase.start_date) || dto.visitDate > String(phase.end_date)) {
      throw new BusinessException(
        'VISIT_INVALID',
        `The visit date must fall inside the phase window (${phase.start_date} – ${phase.end_date}).`,
        400,
      );
    }
    if (!(dto.hoursContributed > 0)) {
      throw new BusinessException('HOURS_REQUIRED', 'A visit needs the hours contributed.', 400);
    }

    // Same door policy as walk-ins on classic sessions: enrolled, or an
    // explicitly flagged active approved volunteer (client decision Q3 —
    // the admin may add any active volunteer to a phase mid-session).
    const [enrollment] = await this.dataSource.query(
      `SELECT 1 FROM event_enrollments WHERE event_id = $1 AND volunteer_id = $2 AND status = 'enrolled'`,
      [phase.event_id, dto.volunteerId],
    );
    if (!enrollment) {
      if (!dto.walkIn) {
        throw new BusinessException(
          'NOT_ENROLLED',
          'This volunteer is not enrolled in the session. Flag them as an added volunteer to log the visit anyway.',
          400,
        );
      }
      const [eligible] = await this.dataSource.query(
        `SELECT 1 FROM volunteers v JOIN users u ON u.id = v.user_id
         WHERE v.id = $1 AND u.is_active AND v.registration_status = 'approved'`,
        [dto.volunteerId],
      );
      if (!eligible) {
        throw new BusinessException(
          'WALKIN_NOT_ELIGIBLE',
          'Added volunteers must be active, approved volunteers.',
          400,
        );
      }
    }

    const [dup] = await this.dataSource.query(
      `SELECT 1 FROM attendance_records WHERE volunteer_id = $1 AND phase_id = $2 AND visit_date = $3`,
      [dto.volunteerId, phaseId, dto.visitDate],
    );
    if (dup) {
      throw new BusinessException(
        'VISIT_INVALID',
        'A visit for this volunteer on this day is already logged — edit or remove it instead.',
        409,
      );
    }

    const saved = await this.records.save(
      this.records.create({
        eventId: phase.event_id,
        volunteerId: dto.volunteerId,
        phaseId,
        visitDate: dto.visitDate,
        attended: true,
        hoursContributed: String(dto.hoursContributed),
        notes: dto.notes ?? null,
        source: 'admin',
        recordedBy: principal.sub,
      }),
    );

    if (phase.status === 'upcoming') {
      await this.dataSource.query(
        `UPDATE event_phases SET status = 'inprogress', updated_at = now() WHERE id = $1`,
        [phaseId],
      );
      await this.dataSource.query('SELECT fn_recompute_event_phase_status($1)', [phase.event_id]);
    }

    await this.audit.record(principal, {
      action: 'attendance.visit_recorded',
      entity: 'attendance_records',
      entityId: saved.id,
      after: {
        volunteerId: dto.volunteerId,
        phase: phase.name,
        visitDate: dto.visitDate,
        hours: saved.hoursContributed,
      },
    });
    return saved;
  }

  async deleteVisit(principal: AuthPrincipal, recordId: string) {
    const record = await this.records.findOneBy({ id: recordId });
    if (!record) throw new NotFoundException('Attendance record not found');
    if (!record.phaseId) {
      throw new BusinessException(
        'VISIT_INVALID',
        'This is a session-level attendance record, not a visit — correct it from the roster instead.',
        400,
      );
    }
    await this.records.delete(recordId);
    await this.audit.record(principal, {
      action: 'attendance.visit_deleted',
      entity: 'attendance_records',
      entityId: recordId,
      before: {
        volunteerId: record.volunteerId,
        phaseId: record.phaseId,
        visitDate: record.visitDate,
        hours: record.hoursContributed,
      },
    });
    return { ok: true };
  }
}
