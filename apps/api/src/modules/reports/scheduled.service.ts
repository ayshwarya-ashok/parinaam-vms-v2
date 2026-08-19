import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportFormat, ReportFrequency, ScheduledReport } from '../../database/entities';

export interface ScheduleInput {
  name: string;
  reportType: string;
  format: ReportFormat;
  frequency: ReportFrequency;
  sendTime: string; // HH:MM
  timezone?: string;
  recipients: string; // comma-separated emails
  filters?: Record<string, unknown>;
}

/** Wall-clock time in a zone, without a timezone library: format, then re-read. */
function zonedNow(timezone: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

/** The zone's current UTC offset in minutes (IST → 330). Fixed-offset accurate; DST zones re-derive each call. */
function offsetMinutes(timezone: string): number {
  const now = new Date();
  const inZone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const inUtc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  return Math.round((inZone.getTime() - inUtc.getTime()) / 60_000);
}

/**
 * Schedules are frequency + send time + timezone, never a cron expression: the
 * next run stays computable and displayable, and "8 am in Kolkata" stays 8 am
 * in Kolkata no matter where the server runs.
 */
@Injectable()
export class ScheduledReportsService {
  constructor(
    @InjectRepository(ScheduledReport) private readonly schedules: Repository<ScheduledReport>,
  ) {}

  /** Next wall-clock occurrence of sendTime in the report's zone, as a UTC instant. */
  computeNextRun(frequency: ReportFrequency, sendTime: string, timezone: string, after = new Date()): Date {
    const [hh, mm] = sendTime.split(':').map(Number);
    const zone = zonedNow(timezone);
    const offset = offsetMinutes(timezone);

    // Candidate: today-in-zone at sendTime, expressed in UTC.
    const candidate = new Date(Date.UTC(zone.y, zone.m - 1, zone.d, hh, mm) - offset * 60_000);

    while (candidate.getTime() <= after.getTime()) {
      if (frequency === 'Daily') candidate.setUTCDate(candidate.getUTCDate() + 1);
      else if (frequency === 'Weekly') candidate.setUTCDate(candidate.getUTCDate() + 7);
      else candidate.setUTCMonth(candidate.getUTCMonth() + 1);
    }
    return candidate;
  }

  async list(): Promise<ScheduledReport[]> {
    return this.schedules.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<ScheduledReport> {
    const schedule = await this.schedules.findOneBy({ id });
    if (!schedule) throw new NotFoundException('Scheduled report not found');
    return schedule;
  }

  async create(input: ScheduleInput, createdBy: string): Promise<ScheduledReport> {
    const timezone = input.timezone ?? 'Asia/Kolkata';
    return this.schedules.save(
      this.schedules.create({
        name: input.name,
        reportType: input.reportType,
        format: input.format,
        frequency: input.frequency,
        sendTime: input.sendTime,
        timezone,
        recipients: input.recipients,
        filters: input.filters ?? {},
        isActive: true,
        nextRunAt: this.computeNextRun(input.frequency, input.sendTime, timezone),
        createdBy,
      }),
    );
  }

  async update(id: string, patch: Partial<ScheduleInput> & { isActive?: boolean }): Promise<ScheduledReport> {
    const schedule = await this.findOne(id);

    const wasActive = schedule.isActive;
    Object.assign(schedule, {
      name: patch.name ?? schedule.name,
      reportType: patch.reportType ?? schedule.reportType,
      format: patch.format ?? schedule.format,
      frequency: patch.frequency ?? schedule.frequency,
      sendTime: patch.sendTime ?? schedule.sendTime,
      timezone: patch.timezone ?? schedule.timezone,
      recipients: patch.recipients ?? schedule.recipients,
      filters: patch.filters ?? schedule.filters,
      isActive: patch.isActive ?? schedule.isActive,
    });

    // Pausing freezes the clock; anything else (resume, retime) recomputes it.
    if (!schedule.isActive) {
      schedule.nextRunAt = null;
    } else if (
      !wasActive ||
      patch.frequency !== undefined ||
      patch.sendTime !== undefined ||
      patch.timezone !== undefined
    ) {
      schedule.nextRunAt = this.computeNextRun(schedule.frequency, schedule.sendTime, schedule.timezone);
    }

    return this.schedules.save(schedule);
  }

  async remove(id: string): Promise<void> {
    const result = await this.schedules.delete({ id });
    if (!result.affected) throw new NotFoundException('Scheduled report not found');
  }

  /** Called by the dispatcher after a firing — advance the clock, stamp the run. */
  async markRan(id: string): Promise<void> {
    const schedule = await this.findOne(id);
    await this.schedules.update(
      { id },
      {
        lastRunAt: new Date(),
        nextRunAt: this.computeNextRun(schedule.frequency, schedule.sendTime, schedule.timezone),
      },
    );
  }

  async findDue(now = new Date()): Promise<ScheduledReport[]> {
    return this.schedules
      .createQueryBuilder('s')
      .where('s.is_active AND s.next_run_at IS NOT NULL AND s.next_run_at <= :now', { now })
      .getMany();
  }
}
