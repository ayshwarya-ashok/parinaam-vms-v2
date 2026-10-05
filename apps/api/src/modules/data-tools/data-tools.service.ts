import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BusinessException } from '../../common';
import { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { AppConfig } from '../../config';
import { AuditService } from '../audit/audit.service';
import { CertificatePdfService } from '../certificates/certificate-pdf.service';
import { StorageService } from '../storage/storage.service';

/**
 * Round 50 — "Reset & seed demo data". The database is wiped back to a
 * scripted client-demo baseline whose SESSION DATES ARE COMPUTED FROM TODAY,
 * so every status (draft, upcoming, full-with-waitlist, running today,
 * in-progress, completed, cancelled, discontinued-blocked) is demoable
 * whenever the script runs. Deterministic ids make the action idempotent.
 *
 * Kept from the live database: the primary admin account, the training
 * catalog, and the audit trail. Everything else is replaced.
 */

const ADMIN_EMAIL = 'admin@parinaam.org';

// Deterministic id namespaces, distinct from the SQL seeds' so provenance is
// obvious in the data. Users 01xx, volunteers 01xx, events 03xx.
const U = (n: number) => `00000000-0000-0000-0100-${String(n).padStart(12, '0')}`;
const V = (n: number) => `00000000-0000-0000-0101-${String(n).padStart(12, '0')}`;
const E = (n: number) => `00000000-0000-0000-0103-${String(n).padStart(12, '0')}`;

const PRG = {
  aap: '00000000-0000-0000-0004-000000000101',
  chote: '00000000-0000-0000-0004-000000000102',
  abv: '00000000-0000-0000-0004-000000000103',
};
const ACT = {
  exposure: '00000000-0000-0000-0005-000000000201',
  read: '00000000-0000-0000-0005-000000000202',
  mentorship: '00000000-0000-0000-0005-000000000203',
  outing: '00000000-0000-0000-0005-000000000204',
};
const COMMUNITY = {
  djHalli: '00000000-0000-0000-0009-000000000002',
  hosur: '00000000-0000-0000-0009-000000000003',
};
const COORD = {
  priya: '00000000-0000-0000-0003-000000000001',
  vikram: '00000000-0000-0000-0003-000000000002',
  kavitha: '00000000-0000-0000-0003-000000000003',
};
const ORG_TECHCORP = '00000000-0000-0000-0002-000000000001';

/** The eight volunteers, each carrying a demo scenario. */
const VOLUNTEERS = [
  { n: 1, email: 'ananya@example.com', first: 'Ananya', last: 'Sharma', gender: 'Female', city: 'Bengaluru', phone: '9876500001', category: 'Individual', consent: true, compliant: true, status: 'approved' },
  { n: 2, email: 'rahul@example.com', first: 'Rahul', last: 'Verma', gender: 'Male', city: 'Bengaluru', phone: '9876500002', category: 'Individual', consent: true, compliant: true, status: 'approved' },
  { n: 3, email: 'meera@example.com', first: 'Meera', last: 'Nair', gender: 'Female', city: 'Bengaluru', phone: '9876500003', category: 'Individual', consent: true, compliant: true, status: 'approved' },
  { n: 4, email: 'sanjay.patel@example.com', first: 'Sanjay', last: 'Patel', gender: 'Male', city: 'Mysuru', phone: '9876500004', category: 'Individual', consent: true, compliant: true, status: 'approved' },
  { n: 5, email: 'deepa@example.com', first: 'Deepa', last: 'Kumar', gender: 'Female', city: 'Bengaluru', phone: '9876500005', category: 'Individual', consent: false, compliant: false, status: 'approved' },
  { n: 6, email: 'anita.rao@example.com', first: 'Anita', last: 'Rao', gender: 'Female', city: 'Bengaluru', phone: '9876500006', category: 'Individual', consent: true, compliant: false, status: 'pending' },
  { n: 7, email: 'csr@techcorp.in', first: 'Ravi', last: 'Kulkarni', gender: 'Male', city: 'Bengaluru', phone: '9876500007', category: 'CSR', consent: true, compliant: true, status: 'approved' },
  { n: 8, email: 'kavya@techcorp.in', first: 'Kavya', last: 'Iyer', gender: 'Female', city: 'Bengaluru', phone: '9876500008', category: 'Individual', consent: true, compliant: true, status: 'approved' },
] as const;

const FCS = [
  { id: U(22), email: 'priya@parinaam.org' },
  { id: U(23), email: 'vikram@parinaam.org' },
  { id: U(24), email: 'arjun@parinaam.org' },
];

const CUSTOM_CERT_TEXT =
  'In heartfelt recognition of the time, energy and compassion so generously given to ' +
  'Parinaam Foundation. Time is the one thing none of us can get back — yet you chose to ' +
  'spend yours lifting up the urban poor communities we serve. That choice has made a real ' +
  'and lasting difference, and for it, we are deeply grateful.';

export interface ResetSummary {
  programs: number;
  activities: number;
  sessions: number;
  volunteers: number;
  fieldCoordinators: number;
  admins: number;
  enrollments: number;
  attendance: number;
  feedback: number;
  certificates: number;
}

/** 'YYYY-MM-DD' for today+offset, on the Indian wall clock the app runs on. */
function day(offset: number): string {
  const d = new Date(Date.now() + offset * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

@Injectable()
export class DataToolsService {
  private readonly logger = new Logger(DataToolsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly pdf: CertificatePdfService,
  ) {}

  get enabled(): boolean {
    return this.config.get('DATA_TOOLS_ENABLED');
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new BusinessException(
        'DATA_TOOLS_DISABLED',
        'Data tools are turned off on this server (DATA_TOOLS_ENABLED=false).',
        404,
      );
    }
  }

  async reset(principal: AuthPrincipal): Promise<ResetSummary> {
    this.assertEnabled();

    // Stored certificate PDFs would otherwise be orphaned on disk.
    const oldFiles: Array<{ file_path: string }> = await this.dataSource.query(
      `SELECT file_path FROM certificates WHERE file_path IS NOT NULL`,
    );

    await this.dataSource.transaction(async (manager) => {
      await this.wipe(manager);
      await this.seedPeople(manager);
      await this.seedCatalog(manager);
      await this.seedSessions(manager);
      await this.seedFieldExecution(manager);
      await this.seedFeedback(manager);
    });

    for (const f of oldFiles) await this.storage.delete(f.file_path);

    // Certificates last: they read the freshly seeded participation and write
    // real PDFs to storage, so View / Download / thumbnails work immediately.
    await this.seedCertificates();

    const summary = await this.summarize();
    await this.audit.record(principal, {
      action: 'data.reset',
      entity: 'database',
      after: summary as unknown as Record<string, unknown>,
    });
    this.logger.warn(`Demo data reseeded by ${principal.sub} (anchor date ${day(0)})`);
    return summary;
  }

  // ── 1. Wipe ────────────────────────────────────────────────────────────────

  private async wipe(m: EntityManager): Promise<void> {
    // Transactional data first, then catalog, then people. The training
    // catalog, coordinators-as-upserted, the primary admin and audit stay.
    for (const table of [
      'email_logs',
      'feedback_issues',
      'feedback_improvements',
      'feedback_submissions',
      'event_photos',
      'certificates',
      'attendance_records',
      'event_reports',
      'event_enrollments',
      'waitlist_entries',
      'event_communities',
      'events',
      'activity_trainings',
      'program_trainings',
      'activities',
      'programs',
    ]) {
      await m.query(`DELETE FROM ${table}`);
    }
    await m.query(`DELETE FROM beneficiary_communities WHERE id NOT IN ($1, $2)`, [
      COMMUNITY.djHalli,
      COMMUNITY.hosur,
    ]);
    // People: every volunteer and field coordinator goes (users cascade their
    // profiles, consents and attempts); extra admins go; the primary stays.
    await m.query(`DELETE FROM users WHERE role IN ('volunteer', 'field_coordinator')`);
    await m.query(`DELETE FROM users WHERE role = 'admin' AND email <> $1`, [ADMIN_EMAIL]);
  }

  // ── 2. People ──────────────────────────────────────────────────────────────

  private async seedPeople(m: EntityManager): Promise<void> {
    await m.query(
      `INSERT INTO users (email, password_hash, role, email_verified_at)
       SELECT $1, crypt('Parinaam@123', gen_salt('bf', 10)), 'admin', now()
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $1)`,
      [ADMIN_EMAIL],
    );

    for (const fc of FCS) {
      await m.query(
        `INSERT INTO users (id, email, password_hash, role, email_verified_at)
         VALUES ($1, $2, crypt('Parinaam@123', gen_salt('bf', 10)), 'field_coordinator', now())`,
        [fc.id, fc.email],
      );
    }

    await m.query(
      `INSERT INTO coordinators (id, name, email, mobile) VALUES
         ('${COORD.priya}',   'Priya Menon',   'priya@parinaam.org',   '+91 98765 43210'),
         ('${COORD.vikram}',  'Vikram Singh',  'vikram@parinaam.org',  '+91 87654 32109'),
         ('${COORD.kavitha}', 'Kavitha Reddy', 'kavitha@parinaam.org', '+91 76543 21098')
       ON CONFLICT (email) DO NOTHING`,
    );

    await m.query(
      `INSERT INTO organizations (id, name, email, phone, contact_person)
       VALUES ($1, 'TechCorp India Pvt. Ltd.', 'csr@techcorp.in', '+91 80 4000 1000', 'Ravi Kulkarni')
       ON CONFLICT (name) DO NOTHING`,
      [ORG_TECHCORP],
    );

    for (const v of VOLUNTEERS) {
      await m.query(
        `INSERT INTO users (id, email, password_hash, role, email_verified_at)
         VALUES ($1, $2, crypt('Parinaam@123', gen_salt('bf', 10)), 'volunteer', now())`,
        [U(v.n), v.email],
      );
      const techcorp = v.email.endsWith('@techcorp.in');
      await m.query(
        `INSERT INTO volunteers (id, user_id, first_name, last_name, gender, age_group, city, state,
                                 phone, category, organization_id, registration_status, reviewed_by, reviewed_at)
         VALUES ($1, $2, $3, $4, $5, '26-35', $6, 'Karnataka', $7, $8, $9, $10,
                 CASE WHEN $11::boolean THEN (SELECT id FROM users WHERE email = '${ADMIN_EMAIL}') END,
                 CASE WHEN $11::boolean THEN now() END)`,
        [V(v.n), U(v.n), v.first, v.last, v.gender, v.city, v.phone, v.category,
         techcorp ? ORG_TECHCORP : null, v.status, v.status === 'approved'],
      );
      if (v.consent) {
        await m.query(
          `INSERT INTO volunteer_consents (volunteer_id, pocso_agreed, posh_agreed, nda_agreed,
                                           signed_name, consent_date)
           VALUES ($1, TRUE, TRUE, TRUE, $2, $3)`,
          [V(v.n), `${v.first} ${v.last}`, day(-45)],
        );
      }
      if (v.compliant) {
        // A passing attempt on every mandatory active training — compliance
        // earned the same way a real volunteer earns it.
        await m.query(
          `INSERT INTO training_attempts (volunteer_id, training_id, attempt_number, score_percent,
                                          correct_count, question_count, passed, attempted_at, expiry_date)
           SELECT $1, t.id, 1, 90.00, 9, 10, TRUE, ($2::date - INTERVAL '1 day'),
                  ($2::date + INTERVAL '12 months')::date
           FROM trainings t WHERE t.is_mandatory AND t.status = 'active'`,
          [V(v.n), day(-44)],
        );
      }
    }
    await m.query(`SELECT fn_recompute_volunteer_phase(id) FROM volunteers`);
  }

  // ── 3. Catalog ─────────────────────────────────────────────────────────────

  private async seedCatalog(m: EntityManager): Promise<void> {
    const admin = `(SELECT id FROM users WHERE email = '${ADMIN_EMAIL}')`;

    await m.query(`
      INSERT INTO beneficiary_communities (id, name, description, city, created_by) VALUES
        ('${COMMUNITY.djHalli}', 'DJ Halli Learning Community',
         'Underserved urban community served by the Academic Adoption Program — Read to Rise sessions and student cohorts (ages 5–21).',
         'Bengaluru', ${admin}),
        ('${COMMUNITY.hosur}', 'Hosur Road Settlement (Ujjivan)',
         'Grassroots community adopted under Chote Kadam for infrastructure interventions with Ujjivan Small Finance Bank mentors.',
         'Bengaluru', ${admin})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, city = EXCLUDED.city`);

    await m.query(`
      INSERT INTO programs (id, code, name, description, status, default_coordinator_id, created_by) VALUES
        ('${PRG.aap}', 'PRG-2026-101', 'Academic Adoption Program (AAP)',
         'Long-running academic support for students from underserved communities in Bangalore — first-generation learners, ages 5–21. Home of Exposure Visits and Read to Rise (Goodhearts volunteering).',
         'active', '${COORD.priya}', ${admin}),
        ('${PRG.chote}', 'PRG-2026-102', 'Chote Kadam',
         'Community infrastructure development with Ujjivan Small Finance Bank — classrooms, anganwadis, healthcare centres. Corporate volunteers are onboarded as mentors mapped to a project for its full lifecycle.',
         'active', '${COORD.vikram}', ${admin}),
        ('${PRG.abv}', 'PRG-2026-103', 'Activity-Based Volunteering',
         'Corporate-sponsored day outings: volunteer groups fund and personally accompany Parinaam students on recreational-cum-educational trips as buddies/chaperones.',
         'active', '${COORD.kavitha}', ${admin})`);

    await m.query(`
      INSERT INTO activities (id, code, program_id, name, description, type, outcome,
                              default_duration_hours, default_max_slots, status, sort_order, created_by) VALUES
        ('${ACT.exposure}', 'ACT-201', '${PRG.aap}', 'Exposure Visit',
         'Single-day site visit / immersion at a partner organization''s workplace for AAP students (17–21): guided tours, career Q&A, skills engagement. Host-organization employees volunteer as guides and mentors.',
         'In person', 'Students connect academic learning with real career pathways.', 4, 12, 'active', 1, ${admin}),
        ('${ACT.read}', 'ACT-202', '${PRG.aap}', 'Read to Rise',
         'Quarterly guided reading and writing sessions per community, facilitated by Field Coordinators with Goodhearts volunteers in one-on-one / small-group support. Storytelling, worksheets, journaling.',
         'In person', 'Improved reading fluency, comprehension and confidence.', 2, 8, 'active', 2, ${admin}),
        ('${ACT.mentorship}', 'ACT-203', '${PRG.chote}', 'Community Infrastructure Mentorship',
         'The mentor journey: onboarding, community engagement, deliberation, design thinking, execution, handover, recognition. Mentors participate rather than observe.',
         'In person', NULL, 8, 6, 'active', 1, ${admin}),
        ('${ACT.outing}', 'ACT-204', '${PRG.abv}', 'Corporate Day Outing',
         'Single-day off-site recreational and educational outing. Corporate volunteers are paired with small student groups in a buddy system; the Field Coordinator owns child safety and logistics.',
         'In person', NULL, 8, 10, 'active', 1, ${admin})`);
    // Discontinued the way the app does it, so the BR-17 enrollment block is
    // demoable on its upcoming session (the status/discontinued_at CHECK
    // requires both set together).
    await m.query(
      `UPDATE activities SET status = 'discontinued', discontinued_at = now() WHERE id = $1`,
      [ACT.outing],
    );
  }

  // ── 4. Sessions — dates anchored to today ─────────────────────────────────

  private async seedSessions(m: EntityManager): Promise<void> {
    const admin = `(SELECT id FROM users WHERE email = '${ADMIN_EMAIL}')`;
    const rows = [
      // [n, code-suffix, activity, name, dayOffset, start, hours, location, slots, coordinator, status, cancelReason]
      [1, ACT.exposure, 'TechCorp Workplace Exposure Visit', -30, '10:00', 4, 'TechCorp Solutions campus, Whitefield', 12, COORD.priya, 'completed', null],
      [2, ACT.read, 'Read to Rise — reading circle (DJ Halli)', -14, '10:00', 2, 'DJ Halli community learning space', 8, COORD.priya, 'completed', null],
      [3, ACT.read, 'Read to Rise — story workshop (DJ Halli)', -7, '10:00', 2, 'DJ Halli community learning space', 8, COORD.priya, 'completed', null],
      [4, ACT.mentorship, 'Anganwadi Renovation — Hosur Road', -10, '09:00', 8, 'Hosur Road settlement anganwadi', 6, COORD.vikram, 'inprogress', null],
      [5, ACT.read, 'Read to Rise — today’s session (DJ Halli)', 0, '16:00', 2, 'DJ Halli community learning space', 8, COORD.priya, 'upcoming', null],
      [6, ACT.exposure, 'Exposure Visit — Finastra campus', 7, '10:00', 4, 'Finastra office, Outer Ring Road', 2, COORD.priya, 'upcoming', null],
      [7, ACT.read, 'Read to Rise — next quarter kickoff', 21, '10:00', 2, 'DJ Halli community learning space', 8, COORD.priya, 'upcoming', null],
      [8, ACT.exposure, 'Exposure Visit — IG Group (planning)', 30, '10:00', 4, 'IG Group office, MG Road', 12, COORD.priya, 'draft', null],
      [9, ACT.mentorship, 'Mentor orientation — Hosur Road', 3, '09:00', 4, 'Hosur Road settlement anganwadi', 6, COORD.vikram, 'cancelled', 'Venue unavailable — rescheduling with the community.'],
      [10, ACT.outing, 'Snow City Outing — TechCorp', 14, '08:30', 8, 'Snow City, JC Nagar', 10, COORD.kavitha, 'upcoming', null],
    ] as const;

    const year = new Date().getFullYear();
    for (const [n, activity, name, offset, start, hours, location, slots, coord, status, reason] of rows) {
      await m.query(
        `INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                             location, city, max_slots, coordinator_id, status, cancel_reason,
                             cancelled_at, cancelled_by, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Bengaluru', $9, $10, $11, $12,
                 CASE WHEN $13::boolean THEN now() END,
                 CASE WHEN $13::boolean THEN ${admin} END, ${admin})`,
        [E(n), `EVT-${year}-03${String(n).padStart(2, '0')}`, activity, name, day(offset),
         start, hours, location, slots, coord, status, reason, status === 'cancelled'],
      );
      await m.query(
        `INSERT INTO event_communities (event_id, community_id) VALUES ($1, $2)`,
        [E(n), activity === ACT.mentorship ? COMMUNITY.hosur : COMMUNITY.djHalli],
      );
    }
  }

  // ── 5. Enrollments, waitlist, attendance, coordinator report ──────────────

  private async seedFieldExecution(m: EntityManager): Promise<void> {
    const admin = `(SELECT id FROM users WHERE email = '${ADMIN_EMAIL}')`;
    const enroll = (event: string, vol: string, daysAgo: number) =>
      m.query(
        `INSERT INTO event_enrollments (event_id, volunteer_id, status, enrolled_at)
         VALUES ($1, $2, 'enrolled', now() - ($3 || ' days')::interval)`,
        [event, vol, daysAgo],
      );

    // Completed sessions: who was there.
    await enroll(E(1), V(1), 35); await enroll(E(1), V(2), 35); await enroll(E(1), V(4), 34);
    await enroll(E(2), V(1), 20);
    await enroll(E(3), V(3), 12);
    // Today's session — the dispatch / mark-completed demo.
    await enroll(E(5), V(1), 3); await enroll(E(5), V(3), 2);
    // Full upcoming session (2 of 2) with Meera first on the waitlist.
    await enroll(E(6), V(2), 5); await enroll(E(6), V(8), 4);
    await m.query(
      `INSERT INTO waitlist_entries (event_id, volunteer_id, position) VALUES ($1, $2, 1)`,
      [E(6), V(3)],
    );
    // Open upcoming session with seats left.
    await enroll(E(7), V(4), 1);

    const att = (event: string, vol: string, fields: string, values: unknown[]) =>
      m.query(
        `INSERT INTO attendance_records (event_id, volunteer_id, ${fields}, recorded_by, recorded_at)
         VALUES ($1, $2, ${values.map((_, i) => `$${i + 3}`).join(', ')}, ${admin}, now())`,
        [event, vol, ...values],
      );

    // S1 (T-30): present with times, present plain, absent with reason+detail.
    await att(E(1), V(1), 'attended, arrival_time, departure_time, hours_contributed, source',
      [true, '10:00', '14:00', 4, 'self']);
    await att(E(1), V(2), 'attended, hours_contributed, notes, source',
      [true, 4, 'Guided the campus tour group.', 'self']);
    await att(E(1), V(4), 'attended, hours_contributed, absence_reason, absence_detail, source',
      [false, 0, 'Personal emergency', 'Family member hospitalised the previous night.', 'admin']);
    // S2 (T-14): the record later bumped to make Ananya's certificate stale.
    await att(E(2), V(1), 'attended, hours_contributed, source', [true, 2, 'self']);
    // S3 (T-7): an admin-recorded enrollee and a walk-in who never enrolled.
    await att(E(3), V(3), 'attended, hours_contributed, notes, source',
      [true, 2, 'Recorded manually — volunteer could not use the email link.', 'admin']);
    await att(E(3), V(8), 'attended, hours_contributed, notes, source',
      [true, 2, 'Walk-in — joined the story workshop on the day.', 'admin']);
    // S4 (in progress): the CSR mentor's running hours.
    await att(E(4), V(7), 'attended, hours_contributed, notes, source',
      [true, 3, 'First site visit with community interactions.', 'admin']);

    // Coordinator report on the oldest completed session.
    await m.query(
      `INSERT INTO event_reports (event_id, coordinator_id, status, actual_start_time, actual_end_time,
                                  volunteers_present, beneficiaries_reached, highlights, challenges, submitted_at)
       VALUES ($1, $2, 'completed', '10:05', '14:10', 2, 38,
               'Students were deeply engaged in the career Q&A; two asked for mentorship follow-ups.',
               'Transport arrived late — start pushed by five minutes.',
               ($3::date + INTERVAL '19 hours'))`,
      [E(1), COORD.priya, day(-30)],
    );
  }

  // ── 6. Feedback ────────────────────────────────────────────────────────────

  private async seedFeedback(m: EntityManager): Promise<void> {
    const fb = async (
      event: string, vol: string, rating: number, nps: number, volAgain: string,
      wentWell: string | null, comments: string | null, published: boolean, submittedOffset: number,
    ): Promise<string> => {
      const [row] = await m.query(
        `INSERT INTO feedback_submissions (event_id, volunteer_id, overall_rating, nps_score, vol_again,
                                           went_well, comments, is_published_testimonial, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($9::date + INTERVAL '20 hours')) RETURNING id`,
        [event, vol, rating, nps, volAgain, wentWell, comments, published, day(submittedOffset)],
      );
      return row.id;
    };

    await fb(E(1), V(1), 5, 10, 'Definitely',
      'The students’ questions were sharper than most college panels.',
      'Volunteering with Parinaam is the best part of my month — the children make every hour count.',
      true, -29);
    await fb(E(1), V(2), 4, 8, 'Probably', 'Well organised tour groups.', null, false, -29);
    const low = await fb(E(1), V(4), 2, 4, 'Not sure', null,
      'Could not attend in the end — and rescheduling communication was confusing.', false, -28);
    await m.query(`INSERT INTO feedback_issues (feedback_id, issue_label) VALUES ($1, 'Transport / logistics')`, [low]);
    await m.query(
      `INSERT INTO feedback_improvements (feedback_id, improvement_label) VALUES ($1, 'Better preparation materials')`,
      [low],
    );
    await fb(E(2), V(1), 4, 9, 'Definitely', 'Reading circles clicked from the first story.', null, false, -13);
  }

  // ── 7. Certificates — real PDFs through the real renderer ─────────────────

  private async seedCertificates(): Promise<void> {
    const year = new Date().getFullYear();
    let seq = 0;
    const nextNumber = () => `PAR-${year}-${String(++seq).padStart(6, '0')}`;

    const issue = async (volunteerId: string, programId: string, certType: 'individual' | 'corporate') => {
      const [p] = await this.dataSource.query(
        `SELECT pp.*, v.first_name || ' ' || v.last_name AS name, p.name AS program_name,
                o.name AS org_name
         FROM v_program_participation pp
         JOIN volunteers v ON v.id = pp.volunteer_id
         LEFT JOIN organizations o ON o.id = v.organization_id
         JOIN programs p ON p.id = pp.program_id
         WHERE pp.volunteer_id = $1 AND pp.program_id = $2`,
        [volunteerId, programId],
      );
      if (!p) return;
      const certificateNumber = nextNumber();
      const pdfBytes = await this.pdf.render({
        certificateNumber,
        volunteerName: p.name,
        programName: p.program_name,
        hours: String(Number(p.total_hours)),
        eventsAttended: p.events_attended,
        periodStart: p.first_attended_on,
        periodEnd: p.last_attended_on,
        certType,
        organizationName: p.org_name ?? null,
        issuedOn: new Date().toISOString(),
      });
      const filePath = `certificates/${certificateNumber}.pdf`;
      await this.storage.put(filePath, pdfBytes);
      await this.dataSource.query(
        `INSERT INTO certificates (certificate_number, volunteer_id, program_id, hours, events_attended,
                                   period_start, period_end, cert_type, organization_id, issued, issued_at,
                                   issued_by, file_path, kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 (SELECT organization_id FROM volunteers WHERE id = $2), TRUE, now(),
                 (SELECT id FROM users WHERE email = '${ADMIN_EMAIL}'), $9, 'program')`,
        [certificateNumber, volunteerId, programId, p.total_hours, p.events_attended,
         p.first_attended_on, p.last_attended_on, certType, filePath],
      );
    };

    // Ananya: individual AAP certificate (6h over two sessions).
    await issue(V(1), PRG.aap, 'individual');
    // The CSR mentor: corporate Chote Kadam certificate (3h, names TechCorp).
    await issue(V(7), PRG.chote, 'corporate');

    // Meera: a custom certificate (Round 48) — hours-independent appreciation.
    const certificateNumber = nextNumber();
    const custom = await this.pdf.renderCustom({
      certificateNumber,
      volunteerName: 'Meera Nair',
      bodyText: CUSTOM_CERT_TEXT,
      issuedOn: new Date().toISOString(),
    });
    const customPath = `certificates/${certificateNumber}.pdf`;
    await this.storage.put(customPath, custom);
    await this.dataSource.query(
      `INSERT INTO certificates (certificate_number, volunteer_id, program_id, hours, events_attended,
                                 cert_type, issued, issued_at, issued_by, file_path, kind, custom_text)
       VALUES ($1, $2, NULL, 0, 0, 'individual', TRUE, now(),
               (SELECT id FROM users WHERE email = '${ADMIN_EMAIL}'), $3, 'custom', $4)`,
      [certificateNumber, V(3), customPath, CUSTOM_CERT_TEXT],
    );

    // Make Ananya's certificate deliberately STALE: a correction after issue
    // (2h -> 2.5h on the reading circle) so the Reissue flow has a subject.
    await this.dataSource.query(
      `UPDATE attendance_records SET hours_contributed = 2.5
       WHERE event_id = $1 AND volunteer_id = $2`,
      [E(2), V(1)],
    );
  }

  private async summarize(): Promise<ResetSummary> {
    const [c] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM programs)   AS programs,
         (SELECT COUNT(*)::int FROM activities) AS activities,
         (SELECT COUNT(*)::int FROM events)     AS sessions,
         (SELECT COUNT(*)::int FROM volunteers) AS volunteers,
         (SELECT COUNT(*)::int FROM users WHERE role = 'field_coordinator') AS field_coordinators,
         (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
         (SELECT COUNT(*)::int FROM event_enrollments) AS enrollments,
         (SELECT COUNT(*)::int FROM attendance_records) AS attendance,
         (SELECT COUNT(*)::int FROM feedback_submissions) AS feedback,
         (SELECT COUNT(*)::int FROM certificates) AS certificates`,
    );
    return {
      programs: c.programs,
      activities: c.activities,
      sessions: c.sessions,
      volunteers: c.volunteers,
      fieldCoordinators: c.field_coordinators,
      admins: c.admins,
      enrollments: c.enrollments,
      attendance: c.attendance,
      feedback: c.feedback,
      certificates: c.certificates,
    };
  }
}
