import { TemplateService } from './template.service';
import type { AppConfig } from '../../config';

describe('TemplateService', () => {
  const config = {
    get: (key: string) =>
      ({
        MAIL_FROM_NAME: 'Parinaam Foundation',
        PUBLIC_WEB_URL: 'http://localhost:5174',
      })[key as string],
  } as unknown as AppConfig;

  let service: TemplateService;

  beforeAll(() => {
    service = new TemplateService(config);
    service.onModuleInit();
  });

  it('loads the template registry from disk', () => {
    expect(service.availableTemplates).toEqual(
      expect.arrayContaining(['smoke_test', 'welcome_verify', 'event_cancelled']),
    );
  });

  it('renders subject and layout-wrapped html', () => {
    const rendered = service.render('smoke_test', { emailLogId: 'x-1' });
    expect(rendered.subject).toContain('smoke test');
    expect(rendered.html).toContain('<!doctype html>');
    expect(rendered.html).toContain('x-1');
    expect(rendered.html).toContain('Parinaam Foundation');
  });

  it('interpolates subject variables', () => {
    const rendered = service.render('event_cancelled', {
      firstName: 'Ananya',
      eventName: 'Blood Pressure Screening',
      eventDate: '19 Aug 2026',
    });
    expect(rendered.subject).toBe('Cancelled: Blood Pressure Screening on 19 Aug 2026');
  });

  it('produces a plain-text fallback without markup', () => {
    const rendered = service.render('smoke_test', { emailLogId: 'x' });
    expect(rendered.text).not.toContain('<');
    expect(rendered.text).toContain('email pipeline works');
  });

  it('throws loudly on an unknown template', () => {
    expect(() => service.render('no_such_template', {})).toThrow('Unknown email template');
  });
});
