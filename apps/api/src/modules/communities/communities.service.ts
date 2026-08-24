import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import { BeneficiaryCommunity } from '../../database/entities';
import type { CreateCommunityDto, UpdateCommunityDto } from './communities.dto';

/**
 * Beneficiary communities — admin-managed master data. Every published
 * session must serve at least one (the >=1 rule lives in EventsAdminService).
 * Communities are archived, never deleted: session links are history.
 */
@Injectable()
export class CommunitiesService {
  constructor(
    @InjectRepository(BeneficiaryCommunity)
    private readonly communities: Repository<BeneficiaryCommunity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(includeArchived = false) {
    const rows = await this.dataSource.query(
      `SELECT bc.id, bc.name, bc.description, bc.city, bc.status,
              COUNT(e.id) FILTER (WHERE e.status = 'upcoming')::int   AS upcoming_sessions,
              COUNT(e.id) FILTER (WHERE e.status = 'inprogress')::int AS inprogress_sessions,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int  AS completed_sessions,
              COUNT(e.id) FILTER (WHERE e.status = 'draft')::int      AS draft_sessions
       FROM beneficiary_communities bc
       LEFT JOIN event_communities ec ON ec.community_id = bc.id
       LEFT JOIN events e ON e.id = ec.event_id
       WHERE ($1 OR bc.status = 'active')
       GROUP BY bc.id
       ORDER BY bc.status, bc.name`,
      [includeArchived],
    );
    return { data: rows };
  }

  async detail(id: string) {
    const community = await this.communities.findOneBy({ id });
    if (!community) throw new NotFoundException('Community not found');
    return community;
  }

  async create(principal: AuthPrincipal, dto: CreateCommunityDto) {
    const existing = await this.communities
      .createQueryBuilder('c')
      .where('LOWER(c.name) = LOWER(:name)', { name: dto.name })
      .getOne();
    if (existing) {
      throw new BusinessException('NAME_TAKEN', 'A community with this name already exists.', 409);
    }
    return this.communities.save(
      this.communities.create({
        name: dto.name,
        description: dto.description ?? null,
        city: dto.city ?? null,
        createdBy: principal.sub,
      }),
    );
  }

  async update(id: string, dto: UpdateCommunityDto) {
    const community = await this.communities.findOneBy({ id });
    if (!community) throw new NotFoundException('Community not found');

    if (dto.name && dto.name.toLowerCase() !== community.name.toLowerCase()) {
      const clash = await this.communities
        .createQueryBuilder('c')
        .where('LOWER(c.name) = LOWER(:name) AND c.id <> :id', { name: dto.name, id })
        .getOne();
      if (clash) {
        throw new BusinessException('NAME_TAKEN', 'A community with this name already exists.', 409);
      }
    }

    Object.assign(community, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.status !== undefined && { status: dto.status }),
    });
    return this.communities.save(community);
  }

  /** The sessions this community is served by, filterable by status. */
  async sessions(id: string, status?: string) {
    await this.detail(id);
    const rows = await this.dataSource.query(
      `SELECT e.id, e.code, COALESCE(e.name, a.name) AS name, e.date, e.start_time,
              e.duration_hours, e.location, e.status,
              a.id AS activity_id, a.name AS activity_name,
              p.id AS program_id, p.name AS program_name,
              cap.enrolled_count, e.max_slots
       FROM event_communities ec
       JOIN events e ON e.id = ec.event_id
       JOIN activities a ON a.id = e.activity_id
       JOIN programs p ON p.id = a.program_id
       JOIN v_event_capacity cap ON cap.event_id = e.id
       WHERE ec.community_id = $1
         AND ($2::text IS NULL OR e.status::text = $2)
       ORDER BY e.date DESC, e.start_time
       LIMIT 300`,
      [id, status ?? null],
    );
    return { data: rows };
  }
}
