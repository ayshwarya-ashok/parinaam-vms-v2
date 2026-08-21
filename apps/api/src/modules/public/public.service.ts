import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SignedUrlService } from '../storage/signed-url.service';

const CACHE_TTL_MS = 5 * 60_000;

/**
 * The unauthenticated aggregates behind /impact.
 *
 * Privacy is structural, not filtered-at-the-edge:
 *  - testimonials come ONLY from rows an admin explicitly published (BR-16),
 *    attributed as first name + last initial, nothing else;
 *  - the gallery serves ONLY photos flagged is_public, via expiring signed
 *    URLs (re-minted each cache refresh) rather than raw storage paths;
 *  - every number is an aggregate — no volunteer contact detail exists in
 *    this payload anywhere.
 *
 * Cached in-process for 5 minutes: the page is shareable, so it must survive
 * being hugged to death without touching the database per hit.
 */
@Injectable()
export class PublicService {
  private cache: { data: Record<string, unknown>; expires: number } | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly signer: SignedUrlService,
  ) {}

  async impact(): Promise<Record<string, unknown>> {
    if (this.cache && this.cache.expires > Date.now()) return this.cache.data;

    const [stats] = await this.dataSource.query(
      `SELECT
        (SELECT COUNT(*)::int FROM volunteers)                                  AS volunteers,
        (SELECT COALESCE(SUM(hours_contributed), 0) FROM attendance_records
           WHERE attended)                                                      AS hours,
        (SELECT COALESCE(SUM(beneficiaries_reached), 0)::int FROM event_reports) AS beneficiaries,
        (SELECT COUNT(*)::int FROM events WHERE status = 'completed')           AS sessions,
        (SELECT COUNT(*)::int FROM programs WHERE status = 'active')            AS active_programs,
        (SELECT COUNT(DISTINCT city)::int FROM volunteers WHERE city IS NOT NULL) AS cities,
        (SELECT COALESCE(ROUND(AVG(overall_rating), 1), 0)
           FROM feedback_submissions)                                           AS avg_rating,
        -- The prototype's "Our Impact" cards, all real:
        (SELECT COALESCE(ROUND(AVG(attendance_pct), 0), 0) FROM v_event_attendance
           WHERE enrolled_count > 0)                                            AS attendance_pct,
        (SELECT COUNT(*)::int FROM v_valid_training_passes)                      AS training_completions,
        (SELECT COUNT(*)::int FROM certificates WHERE issued)                    AS certificates_issued,
        (SELECT COUNT(*)::int FROM organizations WHERE is_active)                AS partner_organizations,
        -- …and the feedback strip.
        (SELECT COUNT(*)::int FROM feedback_submissions)                         AS feedback_responses,
        (SELECT COALESCE(ROUND(AVG(nps_score), 1), 0) FROM feedback_submissions) AS avg_nps`,
    );

    const programs = await this.dataSource.query(
      `SELECT p.name,
              COALESCE(SUM(va.attended_count), 0)::int AS volunteers,
              COALESCE(SUM(va.total_hours), 0) AS hours,
              COALESCE(SUM(va.beneficiaries_reached), 0)::int AS beneficiaries
       FROM programs p
       JOIN activities a ON a.program_id = p.id
       JOIN events e ON e.activity_id = a.id
       JOIN v_event_attendance va ON va.event_id = e.id
       WHERE p.status = 'active'
       GROUP BY p.id, p.name
       HAVING COALESCE(SUM(va.attended_count), 0) > 0
       ORDER BY beneficiaries DESC
       LIMIT 6`,
    );

    // BR-16 lives in this WHERE clause. First name + last initial, full stop.
    const testimonials = await this.dataSource.query(
      `SELECT f.comments,
              f.overall_rating,
              v.first_name || ' ' || LEFT(v.last_name, 1) || '.' AS attribution,
              p.name AS program_name
       FROM feedback_submissions f
       JOIN volunteers v ON v.id = f.volunteer_id
       JOIN events e ON e.id = f.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       WHERE f.is_published_testimonial
         AND f.comments IS NOT NULL AND LENGTH(TRIM(f.comments)) > 0
       ORDER BY f.submitted_at DESC
       LIMIT 6`,
    );

    const photos: Array<{ thumbnail_path: string | null; file_path: string; caption: string | null }> =
      await this.dataSource.query(
        `SELECT ep.file_path, ep.thumbnail_path, ep.caption
         FROM event_photos ep
         WHERE ep.is_public
         ORDER BY ep.sort_order, ep.uploaded_at DESC
         LIMIT 8`,
      );

    const data = {
      stats,
      programs,
      testimonials,
      // Signed URLs outlive the cache window comfortably (default TTL 24h),
      // so a cached payload never hands out a link that expires under it.
      gallery: photos.map((p) => ({
        url: this.signer.publicUrl(p.thumbnail_path ?? p.file_path, 'photo.jpg'),
        caption: p.caption,
      })),
      generatedAt: new Date().toISOString(),
    };

    this.cache = { data, expires: Date.now() + CACHE_TTL_MS };
    return data;
  }
}
