import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BusinessException } from '../../common';
import { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { AppConfig } from '../../config';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

/**
 * The volunteers a reset keeps — a curated ten covering every demo-worthy
 * state (certificate holder, waitlist, consent gate, CSR + affiliate pair,
 * pending registration), not simply the ten oldest rows.
 */
const KEEP_VOLUNTEER_EMAILS = [
  'ananya@example.com',
  'rahul@example.com',
  'meera@example.com',
  'deepa@example.com',
  'nikhil@example.com',
  'amit@example.com',
  'riya@example.com',
  'csr@techcorp.in',
  'kavya@techcorp.in',
  'anita.rao@example.com',
];

const PRIMARY_ADMIN = 'admin@parinaam.org';

/** The third field coordinator, created when fewer than three exist. */
const THIRD_FC = { email: 'arjun@parinaam.org', note: 'Round 49 reset top-up' };

const CLIENT_PROGRAM_IDS = [
  '00000000-0000-0000-0004-000000000101',
  '00000000-0000-0000-0004-000000000102',
  '00000000-0000-0000-0004-000000000103',
];
const CLIENT_ACTIVITY_IDS = [
  '00000000-0000-0000-0005-000000000201',
  '00000000-0000-0000-0005-000000000202',
  '00000000-0000-0000-0005-000000000203',
  '00000000-0000-0000-0005-000000000204',
];
const CLIENT_EVENT_IDS = [
  '00000000-0000-0000-0008-000000000201',
  '00000000-0000-0000-0008-000000000202',
  '00000000-0000-0000-0008-000000000203',
  '00000000-0000-0000-0008-000000000204',
  '00000000-0000-0000-0008-000000000205',
];
const CLIENT_COMMUNITY_IDS = [
  '00000000-0000-0000-0009-000000000002',
  '00000000-0000-0000-0009-000000000003',
];

export interface ResetSummary {
  programs: number;
  activities: number;
  sessions: number;
  volunteers: number;
  fieldCoordinators: number;
  admins: number;
}

/**
 * Round 49 — the Data Tools reset. One transaction that returns the database
 * to the client baseline: the four client-document programmes' catalog
 * (3 programs, 4 activities, 5 sessions — the S005 scenario set, restored
 * field-by-field even if renamed, cancelled or soft-deleted since), ten
 * curated volunteers, the primary admin, and three field coordinators.
 * Everything else — other catalog entries, other volunteers, enrollments,
 * attendance, certificates, feedback, email logs — is removed. Trainings,
 * coordinators and the audit trail are deliberately kept.
 */
@Injectable()
export class DataToolsService {
  private readonly logger = new Logger(DataToolsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
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
    const files: Array<{ file_path: string }> = await this.dataSource.query(
      `SELECT file_path FROM certificates WHERE file_path IS NOT NULL`,
    );

    const summary = await this.dataSource.transaction(async (manager) => {
      const q = (sql: string, params?: unknown[]) => manager.query(sql, params);

      // ── 1. People ─────────────────────────────────────────────────────────
      // Volunteers: keep the curated ten; deleting the USER cascades the
      // volunteer profile and everything hanging off it.
      await q(
        `DELETE FROM users WHERE role = 'volunteer'
          AND email <> ALL($1::text[])`,
        [KEEP_VOLUNTEER_EMAILS],
      );
      // Admins: exactly the primary one.
      await q(`DELETE FROM users WHERE role = 'admin' AND email <> $1`, [PRIMARY_ADMIN]);
      // Field coordinators: the three longest-standing stay; top up if short.
      await q(
        `DELETE FROM users WHERE role = 'field_coordinator' AND id NOT IN (
           SELECT id FROM users WHERE role = 'field_coordinator'
           ORDER BY created_at, id LIMIT 3)`,
      );
      await q(
        `INSERT INTO users (email, password_hash, role, email_verified_at)
         SELECT $1, crypt('Parinaam@123', gen_salt('bf', 10)), 'field_coordinator', now()
         WHERE (SELECT COUNT(*) FROM users WHERE role = 'field_coordinator') < 3
         ON CONFLICT (email) DO NOTHING`,
        [THIRD_FC.email],
      );

      // ── 2. Catalog ────────────────────────────────────────────────────────
      // Everything outside the client set goes; FK cascades clear the tree
      // (activities → events → enrollments, attendance, feedback, photos).
      await q(`DELETE FROM events WHERE id <> ALL($1::uuid[])`, [CLIENT_EVENT_IDS]);
      await q(`DELETE FROM activities WHERE id <> ALL($1::uuid[])`, [CLIENT_ACTIVITY_IDS]);
      await q(`DELETE FROM programs WHERE id <> ALL($1::uuid[])`, [CLIENT_PROGRAM_IDS]);
      await q(
        `DELETE FROM beneficiary_communities WHERE id <> ALL($1::uuid[])`,
        [CLIENT_COMMUNITY_IDS],
      );

      // ── 3. Field-execution and recognition residue ───────────────────────
      // What survives the cascades still references client sessions or kept
      // volunteers; the baseline starts those clean.
      for (const table of [
        'attendance_records',
        'event_reports',
        'event_enrollments',
        'waitlist_entries',
        'certificates',
        'email_logs',
      ]) {
        await q(`DELETE FROM ${table}`);
      }

      // ── 4. The canonical client dataset, restored field by field ─────────
      await this.restoreClientBaseline(q);

      const [counts] = await q(
        `SELECT
           (SELECT COUNT(*)::int FROM programs)   AS programs,
           (SELECT COUNT(*)::int FROM activities) AS activities,
           (SELECT COUNT(*)::int FROM events)     AS sessions,
           (SELECT COUNT(*)::int FROM volunteers) AS volunteers,
           (SELECT COUNT(*)::int FROM users WHERE role = 'field_coordinator') AS field_coordinators,
           (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins`,
      );
      return {
        programs: counts.programs,
        activities: counts.activities,
        sessions: counts.sessions,
        volunteers: counts.volunteers,
        fieldCoordinators: counts.field_coordinators,
        admins: counts.admins,
      } satisfies ResetSummary;
    });

    for (const f of files) await this.storage.delete(f.file_path);

    await this.audit.record(principal, {
      action: 'data.reset',
      entity: 'database',
      entityId: null,
      after: summary as unknown as Record<string, unknown>,
    });
    this.logger.warn(
      `Data reset by ${principal.sub}: ${summary.programs} programs, ${summary.volunteers} volunteers kept`,
    );
    return summary;
  }

  /**
   * The S005 client-scenario catalog, upserted so a reset restores it even
   * when rows were renamed, discontinued, soft-deleted or cancelled since.
   * Values mirror database/seeds/S005__client_scenario_examples.sql.
   */
  private async restoreClientBaseline(
    q: (sql: string, params?: unknown[]) => Promise<unknown>,
  ): Promise<void> {
    const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
    const COORD = {
      one: '00000000-0000-0000-0003-000000000001',
      two: '00000000-0000-0000-0003-000000000002',
      three: '00000000-0000-0000-0003-000000000003',
    };

    await q(`
      INSERT INTO beneficiary_communities (id, name, description, city, created_by) VALUES
        ('${CLIENT_COMMUNITY_IDS[0]}', 'DJ Halli Learning Community',
         'Underserved urban community served by the Academic Adoption Program — Read to Rise sessions and student cohorts (ages 5–21).',
         'Bengaluru', '${ADMIN_ID}'),
        ('${CLIENT_COMMUNITY_IDS[1]}', 'Hosur Road Settlement (Ujjivan)',
         'Grassroots community adopted under Chote Kadam for infrastructure interventions with Ujjivan Small Finance Bank mentors.',
         'Bengaluru', '${ADMIN_ID}')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, city = EXCLUDED.city`);

    await q(`
      INSERT INTO programs (id, code, name, description, status, default_coordinator_id, created_by) VALUES
        ('${CLIENT_PROGRAM_IDS[0]}', 'PRG-2026-101', 'Academic Adoption Program (AAP)',
         'Long-running academic support for students from underserved communities in Bangalore — first-generation learners, ages 5–21. Home of Exposure Visits and Read to Rise (Goodhearts volunteering).',
         'active', '${COORD.one}', '${ADMIN_ID}'),
        ('${CLIENT_PROGRAM_IDS[1]}', 'PRG-2026-102', 'Chote Kadam',
         'Community infrastructure development with Ujjivan Small Finance Bank — classrooms, anganwadis, healthcare centres. Corporate volunteers are onboarded as mentors mapped to a project for its full lifecycle.',
         'active', '${COORD.two}', '${ADMIN_ID}'),
        ('${CLIENT_PROGRAM_IDS[2]}', 'PRG-2026-103', 'Activity-Based Volunteering',
         'Corporate-sponsored day outings: volunteer groups fund and personally accompany Parinaam students on recreational-cum-educational trips as buddies/chaperones.',
         'active', '${COORD.three}', '${ADMIN_ID}')
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code, name = EXCLUDED.name, description = EXCLUDED.description,
        status = 'active', default_coordinator_id = EXCLUDED.default_coordinator_id,
        start_date = NULL, end_date = NULL,
        deleted_at = NULL, deleted_by = NULL, delete_reason = NULL`);

    await q(`
      INSERT INTO activities (id, code, program_id, name, description, type, outcome,
                              default_duration_hours, default_max_slots, status, sort_order, created_by) VALUES
        ('${CLIENT_ACTIVITY_IDS[0]}', 'ACT-201', '${CLIENT_PROGRAM_IDS[0]}', 'Exposure Visit',
         'Single-day site visit / immersion at a partner organization''s workplace for AAP students (17–21): guided tours, career Q&A, skills engagement. Host-organization employees volunteer as guides and mentors.',
         'In person', 'Students connect academic learning with real career pathways.', 4, 12, 'active', 1, '${ADMIN_ID}'),
        ('${CLIENT_ACTIVITY_IDS[1]}', 'ACT-202', '${CLIENT_PROGRAM_IDS[0]}', 'Read to Rise',
         'Quarterly guided reading and writing sessions per community, facilitated by Field Coordinators with Goodhearts volunteers in one-on-one / small-group support. Storytelling, worksheets, journaling.',
         'In person', 'Improved reading fluency, comprehension and confidence.', 2, 8, 'active', 2, '${ADMIN_ID}'),
        ('${CLIENT_ACTIVITY_IDS[2]}', 'ACT-203', '${CLIENT_PROGRAM_IDS[1]}', 'Community Infrastructure Mentorship',
         'The seven-phase mentor journey: onboarding, community engagement, deliberation, design thinking, execution, handover, recognition. Mentors participate rather than observe.',
         'In person', NULL, 8, 6, 'active', 1, '${ADMIN_ID}'),
        ('${CLIENT_ACTIVITY_IDS[3]}', 'ACT-204', '${CLIENT_PROGRAM_IDS[2]}', 'Corporate Day Outing',
         'Single-day off-site recreational and educational outing. Corporate volunteers are paired with small student groups in a buddy system; the Field Coordinator owns child safety and logistics.',
         'In person', NULL, 8, 10, 'active', 1, '${ADMIN_ID}')
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code, program_id = EXCLUDED.program_id, name = EXCLUDED.name,
        description = EXCLUDED.description, type = EXCLUDED.type, outcome = EXCLUDED.outcome,
        default_duration_hours = EXCLUDED.default_duration_hours,
        default_max_slots = EXCLUDED.default_max_slots, status = 'active',
        sort_order = EXCLUDED.sort_order, start_date = NULL, end_date = NULL,
        deleted_at = NULL, deleted_by = NULL, delete_reason = NULL`);

    await q(`
      INSERT INTO events (id, code, activity_id, name, date, start_time, duration_hours,
                          location, city, max_slots, coordinator_id, status, created_by) VALUES
        ('${CLIENT_EVENT_IDS[0]}', 'EVT-2026-0201', '${CLIENT_ACTIVITY_IDS[0]}',
         'TechCorp Workplace Exposure Visit', '2026-09-10', '10:00', 4,
         'TechCorp Solutions campus, Whitefield', 'Bengaluru', 12, '${COORD.one}', 'upcoming', '${ADMIN_ID}'),
        ('${CLIENT_EVENT_IDS[1]}', 'EVT-2026-0202', '${CLIENT_ACTIVITY_IDS[1]}',
         'Read to Rise — Q2 FY27 (DJ Halli)', '2026-08-14', '10:00', 2,
         'DJ Halli community learning space', 'Bengaluru', 8, '${COORD.one}', 'completed', '${ADMIN_ID}'),
        ('${CLIENT_EVENT_IDS[2]}', 'EVT-2026-0203', '${CLIENT_ACTIVITY_IDS[1]}',
         'Read to Rise — Q3 FY27 (DJ Halli)', '2026-11-13', '10:00', 2,
         'DJ Halli community learning space', 'Bengaluru', 8, '${COORD.one}', 'upcoming', '${ADMIN_ID}'),
        ('${CLIENT_EVENT_IDS[3]}', 'EVT-2026-0204', '${CLIENT_ACTIVITY_IDS[2]}',
         'Anganwadi Renovation — Hosur Road', '2026-09-01', '09:00', 8,
         'Hosur Road settlement anganwadi', 'Bengaluru', 6, '${COORD.two}', 'inprogress', '${ADMIN_ID}'),
        ('${CLIENT_EVENT_IDS[4]}', 'EVT-2026-0205', '${CLIENT_ACTIVITY_IDS[3]}',
         'Snow City Outing — TechCorp', '2026-09-26', '08:30', 8,
         'Snow City, JC Nagar', 'Bengaluru', 10, '${COORD.three}', 'upcoming', '${ADMIN_ID}')
      ON CONFLICT (id) DO UPDATE SET
        code = EXCLUDED.code, activity_id = EXCLUDED.activity_id, name = EXCLUDED.name,
        date = EXCLUDED.date, start_time = EXCLUDED.start_time,
        duration_hours = EXCLUDED.duration_hours, location = EXCLUDED.location,
        city = EXCLUDED.city, max_slots = EXCLUDED.max_slots,
        coordinator_id = EXCLUDED.coordinator_id, status = EXCLUDED.status,
        cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL`);

    await q(`
      INSERT INTO event_communities (event_id, community_id) VALUES
        ('${CLIENT_EVENT_IDS[0]}', '${CLIENT_COMMUNITY_IDS[0]}'),
        ('${CLIENT_EVENT_IDS[1]}', '${CLIENT_COMMUNITY_IDS[0]}'),
        ('${CLIENT_EVENT_IDS[2]}', '${CLIENT_COMMUNITY_IDS[0]}'),
        ('${CLIENT_EVENT_IDS[3]}', '${CLIENT_COMMUNITY_IDS[1]}'),
        ('${CLIENT_EVENT_IDS[4]}', '${CLIENT_COMMUNITY_IDS[0]}')
      ON CONFLICT DO NOTHING`);

    // The CSR mentor's folded hours on the in-progress journey (V026 shape) —
    // only when that volunteer is among the kept ten.
    await q(`
      INSERT INTO attendance_records (id, event_id, volunteer_id, attended,
                                      hours_contributed, notes, source, recorded_by)
      SELECT '00000000-0000-0000-0012-000000000001', '${CLIENT_EVENT_IDS[3]}',
             v.id, TRUE, 3, 'First site visit with community interactions.', 'admin', '${ADMIN_ID}'
      FROM volunteers v JOIN users u ON u.id = v.user_id
      WHERE u.email = 'csr@techcorp.in'
      ON CONFLICT (id) DO NOTHING`);
  }
}
