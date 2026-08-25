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
      default:
        throw new BusinessException(
          'UNKNOWN_REPORT_TYPE',
          `Unknown report type "${reportType}". Available: volunteers, programs, calendar.`,
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
