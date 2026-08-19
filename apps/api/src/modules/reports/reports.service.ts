import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportFormat, ReportRun } from '../../database/entities';
import { StorageService } from '../storage/storage.service';
import { ExportersService, FORMAT_META } from './exporters.service';
import { ReportQueryService } from './report-query.service';

/**
 * Every export — on-demand or scheduled — becomes a report_runs row: what ran,
 * with which filters, how many rows, where the file is. On-demand exports at
 * demo scale finish synchronously; the run history is the audit trail either way.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(ReportRun) private readonly runs: Repository<ReportRun>,
    private readonly queries: ReportQueryService,
    private readonly exporters: ExportersService,
    private readonly storage: StorageService,
  ) {}

  async runExport(input: {
    reportType: string;
    format: ReportFormat;
    filters: Record<string, unknown>;
    requestedBy?: string | null;
    scheduledReportId?: string | null;
  }): Promise<ReportRun> {
    const run = await this.runs.save(
      this.runs.create({
        reportType: input.reportType,
        format: input.format,
        filters: input.filters,
        status: 'running',
        requestedBy: input.requestedBy ?? null,
        scheduledReportId: input.scheduledReportId ?? null,
        startedAt: new Date(),
      }),
    );

    try {
      const data = await this.queries.run(input.reportType, input.filters);
      const file =
        input.format === 'CSV'
          ? this.exporters.csv(data)
          : input.format === 'Excel'
            ? await this.exporters.excel(data)
            : await this.exporters.pdf(data, new Date());

      const filePath = `reports/${run.id}.${FORMAT_META[input.format].ext}`;
      await this.storage.put(filePath, file);

      await this.runs.update(
        { id: run.id },
        { status: 'success', rowCount: data.rows.length, filePath, finishedAt: new Date() },
      );
      this.logger.log(`Report ${input.reportType}/${input.format}: ${data.rows.length} rows -> ${filePath}`);
      return (await this.runs.findOneBy({ id: run.id }))!;
    } catch (err) {
      await this.runs.update(
        { id: run.id },
        { status: 'failed', errorMessage: (err as Error).message.slice(0, 2000), finishedAt: new Date() },
      );
      throw err;
    }
  }

  async listRuns(limit = 30): Promise<ReportRun[]> {
    return this.runs.find({ order: { createdAt: 'DESC' }, take: Math.min(limit, 100) });
  }

  async findRun(id: string): Promise<ReportRun> {
    const run = await this.runs.findOneBy({ id });
    if (!run) throw new NotFoundException('Report run not found');
    return run;
  }

  async download(id: string): Promise<{ data: Buffer; filename: string; mime: string }> {
    const run = await this.findRun(id);
    if (run.status !== 'success' || !run.filePath) {
      throw new NotFoundException('No file for this run');
    }
    const meta = FORMAT_META[run.format];
    return {
      data: await this.storage.get(run.filePath),
      filename: `${run.reportType}-${run.createdAt.toISOString().slice(0, 10)}.${meta.ext}`,
      mime: meta.mime,
    };
  }
}
