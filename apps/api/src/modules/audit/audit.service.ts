import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';

interface AuditEntry {
  action: string; // e.g. 'consent.signed', 'program.discontinued'
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** Compliance-relevant changes leave a durable actor/action/before/after trail. */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  async record(actor: AuthPrincipal | null, entry: AuditEntry): Promise<void> {
    await this.logs.save(
      this.logs.create({
      actorId: actor?.sub ?? null,
      actorEmail: actor?.email ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      beforeData: (entry.before as Record<string, unknown>) ?? null,
      afterData: (entry.after as Record<string, unknown>) ?? null,
      ipAddress: entry.ip ?? null,
      }),
    );
  }
}
