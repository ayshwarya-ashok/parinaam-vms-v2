import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BusinessException } from '../../common';

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

export interface ReportData {
  title: string;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
}

export interface VolunteerReportFilters {
  q?: string;
  category?: string;
  phase?: string;
  city?: string;
}

/**
 * Every export format renders THIS query's output — the CSV, the Excel and the
 * PDF of the same filters must contain identical rows, so there is exactly one
 * place that decides what a report contains.
 */
@Injectable()
export class ReportQueryService {
  constructor(private readonly dataSource: DataSource) {}

  /** The report registry. Scheduled reports refer to these keys. */
  async run(reportType: string, filters: Record<string, unknown>): Promise<ReportData> {
    switch (reportType) {
      case 'volunteers':
      case 'volunteer_summary':
        return this.volunteers(filters as VolunteerReportFilters);
      case 'programs':
      case 'program':
      case 'program_summary':
        return this.programs();
      case 'calendar':
      case 'annual_calendar':
        return this.calendar(filters as { year?: number | string });
      case 'activities':
        return this.activities();
      case 'volunteer_directory':
        return this.volunteerDirectory();
      case 'volunteer_activities':
        return this.volunteerActivities();
      default:
        throw new BusinessException(
          'UNKNOWN_REPORT_TYPE',
          `Unknown report type "${reportType}". Available: volunteers, programs, activities, volunteer_directory, volunteer_activities, calendar.`,
          400,
        );
    }
  }

  async volunteers(filters: VolunteerReportFilters): Promise<ReportData> {
    const rows = await this.dataSource.query(
      `SELECT volunteer_name, email, location, category, phase,
              programs_joined, events_enrolled, total_hours, attendance_pct,
              trainings_passed, COALESCE(avg_rating, 0) AS avg_rating, certificates_issued
       FROM v_volunteer_report_summary
       WHERE ($1::text IS NULL OR volunteer_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR category::text = $2)
         AND ($3::text IS NULL OR phase::text = $3)
         AND ($4::text IS NULL OR location = $4)
       ORDER BY total_hours DESC, volunteer_name`,
      [filters.q || null, filters.category || null, filters.phase || null, filters.city || null],
    );

    return {
      title: 'Volunteer Summary',
      columns: [
        { key: 'volunteer_name', label: 'Volunteer' },
        { key: 'email', label: 'Email' },
        { key: 'location', label: 'City' },
        { key: 'category', label: 'Category' },
        { key: 'phase', label: 'Phase' },
        { key: 'programs_joined', label: 'Programmes', align: 'right' },
        { key: 'events_enrolled', label: 'Sessions', align: 'right' },
        { key: 'total_hours', label: 'Hours', align: 'right' },
        { key: 'attendance_pct', label: 'Attendance %', align: 'right' },
        { key: 'trainings_passed', label: 'Trainings', align: 'right' },
        { key: 'avg_rating', label: 'Avg rating', align: 'right' },
        { key: 'certificates_issued', label: 'Certificates', align: 'right' },
      ],
      rows,
    };
  }

  async programs(): Promise<ReportData> {
    const rows = await this.dataSource.query(
      `SELECT p.code, p.name, p.status,
              COUNT(DISTINCT a.id)::int AS activities,
              COUNT(DISTINCT e.id)::int AS events_total,
              COUNT(DISTINCT e.id) FILTER (WHERE e.status = 'completed')::int AS events_completed,
              COALESCE(SUM(va.enrolled_count), 0)::int AS enrolled,
              COALESCE(SUM(va.attended_count), 0)::int AS attended,
              COALESCE(SUM(va.total_hours), 0) AS hours,
              COALESCE(SUM(va.beneficiaries_reached), 0)::int AS beneficiaries
       FROM programs p
       LEFT JOIN activities a ON a.program_id = p.id
       LEFT JOIN events e ON e.activity_id = a.id
       LEFT JOIN v_event_attendance va ON va.event_id = e.id
       GROUP BY p.id, p.code, p.name, p.status
       ORDER BY p.name`,
    );

    return {
      title: 'Programme Summary',
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Programme' },
        { key: 'status', label: 'Status' },
        { key: 'activities', label: 'Activities', align: 'right' },
        { key: 'events_total', label: 'Sessions', align: 'right' },
        { key: 'events_completed', label: 'Completed', align: 'right' },
        { key: 'enrolled', label: 'Enrolled', align: 'right' },
        { key: 'attended', label: 'Attended', align: 'right' },
        { key: 'hours', label: 'Hours', align: 'right' },
        { key: 'beneficiaries', label: 'Beneficiaries', align: 'right' },
      ],
      rows,
    };
  }

  /** Every activity with its programme, status and session tallies. */
  async activities(): Promise<ReportData> {
    const rows = await this.dataSource.query(
      `SELECT p.name AS program, a.name AS activity, a.type::text AS type,
              a.status::text AS status,
              COALESCE(a.default_location, '') AS location,
              a.default_duration_hours AS duration_hours,
              a.default_max_slots AS capacity,
              COUNT(e.id)::int AS sessions_total,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS sessions_completed,
              COUNT(e.id) FILTER (WHERE e.status = 'upcoming')::int AS sessions_upcoming
       FROM activities a
       JOIN programs p ON p.id = a.program_id
       LEFT JOIN events e ON e.activity_id = a.id
       GROUP BY p.name, a.id
       ORDER BY p.name, a.sort_order, a.name`,
    );
    return {
      title: 'Activities',
      columns: [
        { key: 'program', label: 'Programme' },
        { key: 'activity', label: 'Activity' },
        { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' },
        { key: 'location', label: 'Default location' },
        { key: 'duration_hours', label: 'Duration (h)', align: 'right' },
        { key: 'capacity', label: 'Capacity', align: 'right' },
        { key: 'sessions_total', label: 'Sessions', align: 'right' },
        { key: 'sessions_completed', label: 'Completed', align: 'right' },
        { key: 'sessions_upcoming', label: 'Upcoming', align: 'right' },
      ],
      rows,
    };
  }

  /**
   * The volunteer DIRECTORY — who they are, not what they did (that is the
   * volunteer summary's job). Erased volunteers stay out, per the standing
   * reports rule.
   */
  async volunteerDirectory(): Promise<ReportData> {
    const rows = await this.dataSource.query(
      `SELECT v.first_name || ' ' || v.last_name AS volunteer,
              u.email::text AS email,
              COALESCE(v.phone, '') AS phone,
              COALESCE(v.city, '') AS city,
              COALESCE(v.state, '') AS state,
              v.category::text AS category,
              COALESCE(v.sub_category, '') AS sub_category,
              COALESCE(v.institution, '') AS institution,
              COALESCE(o.name, '') AS organization,
              v.phase::text AS phase,
              v.registration_status::text AS registration,
              CASE WHEN u.is_active THEN 'active' ELSE 'deactivated' END AS account,
              TO_CHAR(v.created_at, 'YYYY-MM-DD') AS registered_on
       FROM volunteers v
       JOIN users u ON u.id = v.user_id
       LEFT JOIN organizations o ON o.id = v.organization_id
       WHERE u.email::text NOT LIKE '%@erased.invalid'
       ORDER BY volunteer`,
    );
    return {
      title: 'Volunteer Directory',
      columns: [
        { key: 'volunteer', label: 'Volunteer' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'state', label: 'State' },
        { key: 'category', label: 'Category' },
        { key: 'sub_category', label: 'Sub-category' },
        { key: 'institution', label: 'Institution' },
        { key: 'organization', label: 'Organization' },
        { key: 'phase', label: 'Phase' },
        { key: 'registration', label: 'Registration' },
        { key: 'account', label: 'Account' },
        { key: 'registered_on', label: 'Registered on' },
      ],
      rows,
    };
  }

  /**
   * One row per volunteer per ACTIVITY they enrolled in, carrying the
   * activity's own status — the "who is attached to what, and is that thing
   * still running" view. Hours count attended records only (V012).
   */
  async volunteerActivities(): Promise<ReportData> {
    const rows = await this.dataSource.query(
      `SELECT v.first_name || ' ' || v.last_name AS volunteer,
              u.email::text AS email,
              p.name AS program,
              a.name AS activity,
              a.status::text AS activity_status,
              COUNT(DISTINCT en.event_id)::int AS sessions_enrolled,
              COUNT(DISTINCT ar.event_id) FILTER (WHERE ar.attended)::int AS sessions_attended,
              COALESCE(SUM(ar.hours_contributed) FILTER (WHERE ar.attended), 0) AS hours
       FROM event_enrollments en
       JOIN events e ON e.id = en.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN volunteers v ON v.id = en.volunteer_id
       JOIN users u ON u.id = v.user_id
       LEFT JOIN attendance_records ar
         ON ar.event_id = en.event_id AND ar.volunteer_id = en.volunteer_id
       WHERE en.status = 'enrolled'
         AND u.email::text NOT LIKE '%@erased.invalid'
       GROUP BY v.id, u.email, p.name, a.id
       ORDER BY volunteer, p.name, a.name`,
    );
    return {
      title: 'Volunteer Activities',
      columns: [
        { key: 'volunteer', label: 'Volunteer' },
        { key: 'email', label: 'Email' },
        { key: 'program', label: 'Programme' },
        { key: 'activity', label: 'Activity' },
        { key: 'activity_status', label: 'Activity status' },
        { key: 'sessions_enrolled', label: 'Enrolled', align: 'right' },
        { key: 'sessions_attended', label: 'Attended', align: 'right' },
        { key: 'hours', label: 'Hours', align: 'right' },
      ],
      rows,
    };
  }

  /**
   * The Goodhearts annual calendar (client doc §1.4): every session of a
   * calendar year, month by month — the export shared with corporate partners
   * when planning the year's volunteering.
   */
  async calendar(filters: { year?: number | string }): Promise<ReportData> {
    const year = Number(filters.year) || new Date().getFullYear();
    const rows = await this.dataSource.query(
      `SELECT TO_CHAR(e.date, 'Month') AS month,
              TO_CHAR(e.date, 'YYYY-MM-DD') AS date,
              p.name AS program,
              a.name AS activity,
              COALESCE(e.name, a.name) AS session,
              e.status::text AS status,
              COALESCE(STRING_AGG(DISTINCT bc.name, ', '), '—') AS communities,
              cap.enrolled_count AS enrolled,
              e.max_slots
       FROM events e
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       LEFT JOIN event_communities ec ON ec.event_id = e.id
       LEFT JOIN beneficiary_communities bc ON bc.id = ec.community_id
       WHERE EXTRACT(YEAR FROM e.date) = $1 AND e.status <> 'cancelled'
       GROUP BY e.id, a.name, p.name, cap.enrolled_count
       ORDER BY e.date, e.start_time`,
      [year],
    );
    return {
      title: `Volunteering Calendar ${year}`,
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'date', label: 'Date' },
        { key: 'program', label: 'Programme' },
        { key: 'activity', label: 'Activity' },
        { key: 'session', label: 'Session' },
        { key: 'status', label: 'Status' },
        { key: 'communities', label: 'Communities' },
        { key: 'enrolled', label: 'Enrolled', align: 'right' },
        { key: 'max_slots', label: 'Capacity', align: 'right' },
      ],
      rows,
    };
  }
}
