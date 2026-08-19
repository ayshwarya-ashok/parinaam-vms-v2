import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppConfig } from '../../config';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Templates live in the API, not in n8n.
 *
 * That is deliberate: the admin's on-screen email preview and the message that
 * actually goes out are produced by this same service, so the preview cannot
 * drift from the send. Moving rendering into n8n would let staff reword emails
 * without a deploy but would break that guarantee. (Decision D, 2026-08-18.)
 */
@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();
  private layout!: Handlebars.TemplateDelegate;

  /** Subject lines, kept beside the bodies so a template is one unit. */
  private readonly subjects: Record<string, string> = {
    smoke_test: 'Parinaam VMS — pipeline smoke test',
    welcome_verify: 'Welcome to Parinaam — confirm your email',
    password_reset: 'Reset your Parinaam password',
    registration_confirmed: 'Registration confirmed — {{eventName}}',
    training_required: 'Required trainings before {{eventName}}',
    event_cancelled: 'Cancelled: {{eventName}} on {{eventDate}}',
    waitlist_promoted: "A place opened up — you're in for {{eventName}}",
    attendance_volunteer: 'Action required: mark your attendance — {{eventName}}',
    attendance_coordinator: 'Action required: submit your report — {{eventName}}',
    attendance_reminder: 'Reminder: mark your attendance — {{eventName}}',
    program_announcement: '🎉 New volunteering opportunity — {{programName}}',
    certificate_issued: 'Your certificate of appreciation — {{programName}}',
    feedback_request: 'How was {{eventName}}? Two minutes of feedback',
    report_ready: '📊 {{reportName}} — your scheduled report',
    compliance_expiring: 'Your {{trainingName}} certification expires soon',
  };

  constructor(private readonly config: AppConfig) {}

  onModuleInit(): void {
    const dir = this.resolveTemplateDir();
    if (!dir) {
      this.logger.warn('No template directory found — emails will fail to render');
      return;
    }

    Handlebars.registerHelper('year', () => new Date().getFullYear());

    const layoutPath = join(dir, '_layout.hbs');
    this.layout = Handlebars.compile(readFileSync(layoutPath, 'utf8'));

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.hbs')) continue;
      // _name.hbs (other than the layout) registers as the {{> name}} partial.
      if (file.startsWith('_')) {
        if (file !== '_layout.hbs') {
          Handlebars.registerPartial(
            file.slice(1).replace(/.hbs$/, ''),
            readFileSync(join(dir, file), 'utf8'),
          );
        }
        continue;
      }
      const key = file.replace(/\.hbs$/, '');
      this.templates.set(key, Handlebars.compile(readFileSync(join(dir, file), 'utf8')));
    }

    this.logger.log(`Loaded ${this.templates.size} email templates from ${dir}`);
  }

  has(templateKey: string): boolean {
    return this.templates.has(templateKey);
  }

  get availableTemplates(): string[] {
    return [...this.templates.keys()].sort();
  }

  render(templateKey: string, context: Record<string, unknown>): RenderedEmail {
    const template = this.templates.get(templateKey);
    if (!template) {
      throw new Error(`Unknown email template: ${templateKey}`);
    }

    const webUrl = this.config.get('PUBLIC_WEB_URL');
    const fullContext = {
      walletUrl: `${webUrl}/app/certificates`,
      feedbackUrl: `${webUrl}/app/feedback`,
      ...context,
      orgName: this.config.get('MAIL_FROM_NAME'),
      webUrl,
    };

    const body = template(fullContext);
    const html = this.layout({ ...fullContext, body });
    const subject = Handlebars.compile(this.subjects[templateKey] ?? 'Parinaam Foundation')(
      fullContext,
    );

    return { subject, html, text: this.toPlainText(body) };
  }

  /** Crude but adequate fallback for clients that refuse HTML. */
  private toPlainText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /** Works both from ts-node (src) and from a compiled build (dist). */
  private resolveTemplateDir(): string | null {
    const candidates = [
      join(__dirname, 'templates'),
      join(process.cwd(), 'src/modules/notifications/templates'),
      join(process.cwd(), 'dist/modules/notifications/templates'),
    ];
    return candidates.find((c) => existsSync(join(c, '_layout.hbs'))) ?? null;
  }
}
