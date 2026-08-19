import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessErrors, BusinessException } from '../../common';
import {
  FeedbackImprovement,
  FeedbackIssue,
  FeedbackOption,
  FeedbackSubmission,
  Volunteer,
} from '../../database/entities';

export interface SubmitFeedbackInput {
  eventId: string;
  overallRating: number;
  npsScore: number;
  volAgain?: 'Definitely' | 'Probably' | 'Not sure' | 'Unlikely';
  wentWell?: string;
  issues?: string[];
  wentWrongDetail?: string;
  improvements?: string[];
  improvementDetail?: string;
  comments?: string;
}

/**
 * BR-09: one submission per volunteer per OCCURRENCE, so a complaint points at
 * one specific morning a coordinator can act on. Only volunteers who actually
 * attended the occurrence may rate it.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(FeedbackSubmission) private readonly submissions: Repository<FeedbackSubmission>,
    @InjectRepository(FeedbackOption) private readonly options: Repository<FeedbackOption>,
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
  ) {}

  /** The admin-curated tag vocabulary the form renders from. */
  async optionCatalog(): Promise<{ issues: string[]; improvements: string[] }> {
    const rows = await this.options.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    return {
      issues: rows.filter((r) => r.kind === 'issue').map((r) => r.label),
      improvements: rows.filter((r) => r.kind === 'improvement').map((r) => r.label),
    };
  }

  /** Attended occurrences the signed-in volunteer has not yet rated. */
  async eligibleEvents(userId: string): Promise<Array<Record<string, unknown>>> {
    const volunteer = await this.volunteers.findOne({ where: { userId } });
    if (!volunteer) return [];

    return this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS name, e.date, e.start_time,
              e.location, p.name AS program_name, ar.hours_contributed
       FROM attendance_records ar
       JOIN events e ON e.id = ar.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE ar.volunteer_id = $1 AND ar.attended
         AND NOT EXISTS (
           SELECT 1 FROM feedback_submissions f
           WHERE f.event_id = e.id AND f.volunteer_id = $1)
       ORDER BY e.date DESC
       LIMIT 50`,
      [volunteer.id],
    );
  }

  async submit(userId: string, input: SubmitFeedbackInput): Promise<{ id: string }> {
    const volunteer = await this.volunteers.findOne({ where: { userId } });
    if (!volunteer) throw new NotFoundException('Volunteer profile not found');

    // Attendance is the ticket to rate: no attended record, no feedback.
    const attended = await this.dataSource.query(
      `SELECT 1 FROM attendance_records
       WHERE event_id = $1 AND volunteer_id = $2 AND attended`,
      [input.eventId, volunteer.id],
    );
    if (attended.length === 0) {
      throw new BusinessException(
        'NOT_ATTENDED',
        'Feedback is open only for sessions you attended.',
        409,
      );
    }

    const existing = await this.submissions.findOne({
      where: { eventId: input.eventId, volunteerId: volunteer.id },
    });
    if (existing) throw BusinessErrors.feedbackAlreadySubmitted();

    return this.dataSource.transaction(async (manager) => {
      const submission = await manager.getRepository(FeedbackSubmission).save(
        manager.getRepository(FeedbackSubmission).create({
          volunteerId: volunteer.id,
          eventId: input.eventId,
          overallRating: input.overallRating,
          npsScore: input.npsScore,
          volAgain: input.volAgain ?? null,
          wentWell: input.wentWell?.trim() || null,
          wentWrongDetail: input.wentWrongDetail?.trim() || null,
          improvementDetail: input.improvementDetail?.trim() || null,
          comments: input.comments?.trim() || null,
        }),
      );

      const issueRepo = manager.getRepository(FeedbackIssue);
      for (const label of new Set(input.issues ?? [])) {
        await issueRepo.save(issueRepo.create({ feedbackId: submission.id, issueLabel: label }));
      }
      const improvementRepo = manager.getRepository(FeedbackImprovement);
      for (const label of new Set(input.improvements ?? [])) {
        await improvementRepo.save(
          improvementRepo.create({ feedbackId: submission.id, improvementLabel: label }),
        );
      }

      return { id: submission.id };
    });
  }

  async mine(userId: string): Promise<Array<Record<string, unknown>>> {
    const volunteer = await this.volunteers.findOne({ where: { userId } });
    if (!volunteer) return [];

    return this.dataSource.query(
      `SELECT f.id, f.overall_rating, f.nps_score, f.vol_again, f.comments,
              f.is_published_testimonial, f.submitted_at,
              COALESCE(e.name, a.name) AS event_name, e.date, p.name AS program_name
       FROM feedback_submissions f
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE f.volunteer_id = $1
       ORDER BY f.submitted_at DESC`,
      [volunteer.id],
    );
  }

  /** Admin list, newest first, with the tag rows inlined. */
  async list(filters: {
    programId?: string;
    eventId?: string;
    rating?: number;
    published?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    return this.dataSource.query(
      `SELECT f.id, f.overall_rating, f.nps_score, f.vol_again,
              f.went_well, f.went_wrong_detail, f.improvement_detail, f.comments,
              f.is_published_testimonial, f.submitted_at,
              v.first_name || ' ' || v.last_name AS volunteer_name,
              COALESCE(e.name, a.name) AS event_name, e.date AS event_date,
              p.id AS program_id, p.name AS program_name,
              COALESCE((SELECT array_agg(i.issue_label) FROM feedback_issues i
                        WHERE i.feedback_id = f.id), '{}') AS issues,
              COALESCE((SELECT array_agg(m.improvement_label) FROM feedback_improvements m
                        WHERE m.feedback_id = f.id), '{}') AS improvements
       FROM feedback_submissions f
       JOIN volunteers v ON v.id = f.volunteer_id
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE ($1::uuid IS NULL OR p.id = $1)
         AND ($2::uuid IS NULL OR e.id = $2)
         AND ($3::int IS NULL OR f.overall_rating = $3)
         AND ($4::boolean IS NULL OR f.is_published_testimonial = $4)
       ORDER BY f.submitted_at DESC
       LIMIT 200`,
      [
        filters.programId ?? null,
        filters.eventId ?? null,
        filters.rating ?? null,
        filters.published ?? null,
      ],
    );
  }

  /**
   * The numbers behind the recognition dashboard: rating and NPS aggregates,
   * would-volunteer-again distribution, and the ranked tag leaderboards.
   */
  async analytics(programId?: string): Promise<Record<string, unknown>> {
    const scope = `FROM feedback_submissions f
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       WHERE ($1::uuid IS NULL OR a.program_id = $1)`;

    const [summary] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              ROUND(AVG(f.overall_rating), 2) AS avg_rating,
              ROUND(AVG(f.nps_score), 1) AS avg_nps,
              (COUNT(*) FILTER (WHERE f.nps_score >= 9)
               - COUNT(*) FILTER (WHERE f.nps_score <= 6))::float
               / NULLIF(COUNT(*), 0) * 100 AS nps,
              COUNT(*) FILTER (WHERE f.is_published_testimonial)::int AS published
       ${scope}`,
      [programId ?? null],
    );

    const ratings = await this.dataSource.query(
      `SELECT f.overall_rating AS rating, COUNT(*)::int AS count ${scope}
       GROUP BY f.overall_rating ORDER BY f.overall_rating DESC`,
      [programId ?? null],
    );

    const volAgain = await this.dataSource.query(
      `SELECT f.vol_again AS answer, COUNT(*)::int AS count ${scope}
         AND f.vol_again IS NOT NULL
       GROUP BY f.vol_again ORDER BY count DESC`,
      [programId ?? null],
    );

    const issues = await this.dataSource.query(
      `SELECT i.issue_label AS label, COUNT(*)::int AS count
       FROM feedback_issues i
       JOIN feedback_submissions f ON f.id = i.feedback_id
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       WHERE ($1::uuid IS NULL OR a.program_id = $1)
       GROUP BY i.issue_label ORDER BY count DESC LIMIT 10`,
      [programId ?? null],
    );

    const improvements = await this.dataSource.query(
      `SELECT m.improvement_label AS label, COUNT(*)::int AS count
       FROM feedback_improvements m
       JOIN feedback_submissions f ON f.id = m.feedback_id
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       WHERE ($1::uuid IS NULL OR a.program_id = $1)
       GROUP BY m.improvement_label ORDER BY count DESC LIMIT 10`,
      [programId ?? null],
    );

    return {
      total: summary?.total ?? 0,
      avgRating: summary?.avg_rating !== null ? Number(summary.avg_rating) : null,
      avgNps: summary?.avg_nps !== null ? Number(summary.avg_nps) : null,
      nps: summary?.nps !== null ? Math.round(Number(summary.nps)) : null,
      published: summary?.published ?? 0,
      ratingDistribution: ratings,
      volAgainDistribution: volAgain,
      topIssues: issues,
      topImprovements: improvements,
    };
  }

  /** BR-16: nothing a volunteer wrote surfaces publicly without this flag. */
  async setPublished(id: string, publish: boolean): Promise<void> {
    const result = await this.submissions.update({ id }, { isPublishedTestimonial: publish });
    if (!result.affected) throw new NotFoundException('Feedback submission not found');
  }
}
