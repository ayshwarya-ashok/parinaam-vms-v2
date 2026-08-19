import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export type DashboardPeriod = 'all' | 'month' | 'quarter' | 'year';

export interface DashboardFilters {
  period: DashboardPeriod;
  programId?: string;
  city?: string;
}

/**
 * One request, the whole dashboard.
 *
 * Every KPI and every series applies the same three predicates — period,
 * programme, city — as real SQL, so changing a filter re-queries everything
 * consistently instead of serving pre-baked per-filter datasets.
 *
 * Predicate semantics:
 *  - period  → lower bound on the metric's own date axis (event date,
 *              submission time, volunteer creation).
 *  - program → activity-derived metrics scope to that programme; volunteer
 *              population metrics scope to volunteers who enrolled in it.
 *  - city    → volunteer-derived metrics scope to volunteers from that city.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly dataSource: DataSource) {}

  // Always-true predicate typing all three shared params, so every query in
  // the batch binds the same parameter array (pg rejects unreferenced params).
  private readonly ANCHOR = `($1::date IS NULL OR TRUE) AND ($2::uuid IS NULL OR TRUE) AND ($3::text IS NULL OR TRUE)`;

  async dashboard(filters: DashboardFilters): Promise<Record<string, unknown>> {
    const since = this.sinceOf(filters.period);
    const params = [since, filters.programId ?? null, filters.city ?? null];

    // Volunteer population under the current filters, reused by every
    // volunteer-shaped metric so they all describe the same set of people.
    const VOL = `
      SELECT v.* FROM volunteers v
      WHERE ($3::text IS NULL OR v.city = $3)
        AND ($2::uuid IS NULL OR EXISTS (
          SELECT 1 FROM event_enrollments en
          JOIN events e ON e.id = en.event_id
          JOIN activities a ON a.id = e.activity_id
          WHERE en.volunteer_id = v.id AND a.program_id = $2))`;

    // Attendance joined up to programme + volunteer, the hours/impact spine.
    const ATT = `
      SELECT ar.*, e.date AS event_date, a.program_id
      FROM attendance_records ar
      JOIN events e ON e.id = ar.event_id
      JOIN activities a ON a.id = e.activity_id
      JOIN volunteers v ON v.id = ar.volunteer_id
      WHERE ($1::date IS NULL OR e.date >= $1)
        AND ($2::uuid IS NULL OR a.program_id = $2)
        AND ($3::text IS NULL OR v.city = $3)`;

    const [
      kpis,
      byGender,
      byCategory,
      byPhase,
      programStatus,
      eventStatus,
      growth,
      monthlyHours,
      beneficiaries,
      attendanceByProgram,
      ratings,
      trainingCompletion,
      cities,
    ] = await Promise.all([
      this.kpis(params, VOL, ATT),
      this.dataSource.query(
        `SELECT gender AS label, COUNT(*)::int AS count FROM (${VOL}) v WHERE ${this.ANCHOR} GROUP BY gender ORDER BY count DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT category AS label, COUNT(*)::int AS count FROM (${VOL}) v WHERE ${this.ANCHOR} GROUP BY category ORDER BY count DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT phase AS label, COUNT(*)::int AS count FROM (${VOL}) v
         WHERE ${this.ANCHOR}
         GROUP BY phase
         ORDER BY array_position(ARRAY['Onboarding','In Training','Active','Inactive'], phase::text)`,
        params,
      ),
      this.dataSource.query(
        `SELECT status AS label, COUNT(*)::int AS count FROM programs
         WHERE ${this.ANCHOR} AND ($2::uuid IS NULL OR id = $2) GROUP BY status ORDER BY count DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT e.status AS label, COUNT(*)::int AS count
         FROM events e JOIN activities a ON a.id = e.activity_id
         WHERE ${this.ANCHOR} AND ($1::date IS NULL OR e.date >= $1)
           AND ($2::uuid IS NULL OR a.program_id = $2)
         GROUP BY e.status ORDER BY count DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT to_char(date_trunc('month', v.created_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS count
         FROM (${VOL}) v
         WHERE ($1::date IS NULL OR v.created_at >= $1)
         GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.dataSource.query(
        `SELECT to_char(date_trunc('month', att.event_date), 'YYYY-MM') AS month,
                COALESCE(SUM(att.hours_contributed) FILTER (WHERE att.attended), 0) AS hours
         FROM (${ATT}) att GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.dataSource.query(
        `SELECT to_char(date_trunc('month', e.date), 'YYYY-MM') AS month,
                COALESCE(SUM(r.beneficiaries_reached), 0)::int AS beneficiaries
         FROM event_reports r
         JOIN events e ON e.id = r.event_id
         JOIN activities a ON a.id = e.activity_id
         WHERE ${this.ANCHOR} AND ($1::date IS NULL OR e.date >= $1)
           AND ($2::uuid IS NULL OR a.program_id = $2)
         GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.dataSource.query(
        `SELECT p.name AS label,
                COALESCE(SUM(va.enrolled_count), 0)::int AS enrolled,
                COALESCE(SUM(va.attended_count), 0)::int AS attended
         FROM v_event_attendance va
         JOIN events e ON e.id = va.event_id
         JOIN programs p ON p.id = va.program_id
         WHERE ${this.ANCHOR} AND ($1::date IS NULL OR e.date >= $1)
           AND ($2::uuid IS NULL OR va.program_id = $2)
         GROUP BY p.name HAVING COALESCE(SUM(va.enrolled_count), 0) > 0
         ORDER BY enrolled DESC`,
        params,
      ),
      this.dataSource.query(
        `SELECT f.overall_rating AS rating, COUNT(*)::int AS count
         FROM feedback_submissions f
         JOIN events e ON e.id = f.event_id
         JOIN activities a ON a.id = e.activity_id
         JOIN volunteers v ON v.id = f.volunteer_id
         WHERE ($1::date IS NULL OR f.submitted_at >= $1)
           AND ($2::uuid IS NULL OR a.program_id = $2)
           AND ($3::text IS NULL OR v.city = $3)
         GROUP BY f.overall_rating ORDER BY f.overall_rating`,
        params,
      ),
      this.dataSource.query(
        `SELECT t.name AS label,
                COUNT(vtp.volunteer_id)::int AS passed,
                (SELECT COUNT(*)::int FROM (${VOL}) v) AS eligible
         FROM trainings t
         LEFT JOIN v_valid_training_passes vtp
           ON vtp.training_id = t.id
          AND vtp.volunteer_id IN (SELECT id FROM (${VOL}) v)
         WHERE ${this.ANCHOR} AND t.is_mandatory AND t.status = 'active'
         GROUP BY t.name ORDER BY t.name`,
        params,
      ),
      this.dataSource.query(
        `SELECT DISTINCT city FROM volunteers WHERE city IS NOT NULL ORDER BY city`,
      ),
    ]);

    return {
      filters,
      kpis,
      charts: {
        volunteersByGender: byGender,
        volunteersByCategory: byCategory,
        volunteersByPhase: byPhase,
        programStatus,
        eventStatus,
        volunteerGrowth: growth,
        monthlyHours,
        beneficiariesByMonth: beneficiaries,
        attendanceByProgram,
        ratingDistribution: ratings,
        trainingCompletion,
      },
      meta: { cities: cities.map((c: { city: string }) => c.city) },
    };
  }

  private async kpis(
    params: unknown[],
    VOL: string,
    ATT: string,
  ): Promise<Record<string, unknown>> {
    const [row] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*)::int FROM (${VOL}) v)                                   AS total_volunteers,
        (SELECT COUNT(*)::int FROM (${VOL}) v WHERE v.phase = 'Active')          AS active_volunteers,
        (SELECT COALESCE(SUM(att.hours_contributed) FILTER (WHERE att.attended), 0)
           FROM (${ATT}) att)                                                    AS total_hours,
        (SELECT COUNT(DISTINCT att.event_id)::int FROM (${ATT}) att
           WHERE att.attended)                                                   AS sessions_with_attendance,
        (SELECT COUNT(*)::int FROM events e
           JOIN activities a ON a.id = e.activity_id
           WHERE e.status = 'completed'
             AND ($1::date IS NULL OR e.date >= $1)
             AND ($2::uuid IS NULL OR a.program_id = $2))                        AS events_conducted,
        (SELECT COUNT(*)::int FROM events e
           JOIN activities a ON a.id = e.activity_id
           WHERE e.status = 'upcoming'
             AND ($2::uuid IS NULL OR a.program_id = $2))                        AS events_upcoming,
        (SELECT COALESCE(SUM(r.beneficiaries_reached), 0)::int FROM event_reports r
           JOIN events e ON e.id = r.event_id
           JOIN activities a ON a.id = e.activity_id
           WHERE ($1::date IS NULL OR e.date >= $1)
             AND ($2::uuid IS NULL OR a.program_id = $2))                        AS total_beneficiaries,
        (SELECT COALESCE(ROUND(AVG(f.overall_rating), 1), 0) FROM feedback_submissions f
           JOIN events e ON e.id = f.event_id
           JOIN activities a ON a.id = e.activity_id
           JOIN volunteers v ON v.id = f.volunteer_id
           WHERE ($1::date IS NULL OR f.submitted_at >= $1)
             AND ($2::uuid IS NULL OR a.program_id = $2)
             AND ($3::text IS NULL OR v.city = $3))                              AS avg_rating,
        (SELECT COUNT(*)::int FROM certificates c
           WHERE c.issued AND ($2::uuid IS NULL OR c.program_id = $2)
             AND c.volunteer_id IN (SELECT id FROM (${VOL}) v))                  AS certificates_issued,
        (SELECT COUNT(*)::int FROM (${VOL}) v
           JOIN v_volunteer_compliance vc ON vc.volunteer_id = v.id
           WHERE vc.is_compliant)                                                AS compliant_volunteers`,
      params,
    );
    return row;
  }

  /** Period → inclusive lower bound; null means no bound. */
  private sinceOf(period: DashboardPeriod): string | null {
    if (period === 'all') return null;
    const now = new Date();
    const d = new Date(now);
    if (period === 'month') d.setMonth(now.getMonth() - 1);
    if (period === 'quarter') d.setMonth(now.getMonth() - 3);
    if (period === 'year') d.setFullYear(now.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }
}
