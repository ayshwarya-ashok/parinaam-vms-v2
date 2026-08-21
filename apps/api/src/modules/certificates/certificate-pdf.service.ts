import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';

export interface CertificateData {
  certificateNumber: string;
  volunteerName: string;
  programName: string;
  hours: string;
  eventsAttended: number;
  periodStart: string | null;
  periodEnd: string | null;
  certType: 'individual' | 'corporate';
  organizationName?: string | null;
  issuedOn: string;
}

// A4 landscape, in points.
const W = 842;
const H = 595;

const INK = rgb(15 / 255, 43 / 255, 45 / 255);
const ACCENT = rgb(217 / 255, 108 / 255, 63 / 255);
const ACCENT_STRONG = rgb(188 / 255, 83 / 255, 40 / 255);
const MUTED = rgb(94 / 255, 106 / 255, 98 / 255);
const CREAM = rgb(251 / 255, 246 / 255, 236 / 255);

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Certificate rendering with pdf-lib — pure JS, no Chromium.
 *
 * The design doc reached for Puppeteer to reuse the HTML template; on Alpine
 * that costs a ~300MB Chromium layer and a process pool for what is, in the
 * end, one fixed A4 layout. pdf-lib draws the same certificate deterministically
 * at a fraction of the weight. If pixel-parity with an HTML design ever becomes
 * a requirement, the swap is contained to this one service.
 */
@Injectable()
export class CertificatePdfService {
  private readonly logger = new Logger(CertificatePdfService.name);

  /** The logo PNG, read once. null when the asset is missing — see render(). */
  private logoBytes: Buffer | null | undefined;

  /** Works from ts-node (src) and from a compiled build (dist), like templates. */
  private loadLogo(): Buffer | null {
    if (this.logoBytes !== undefined) return this.logoBytes;
    const candidates = [
      join(__dirname, '../../assets/parinaam-logo.png'),
      join(process.cwd(), 'src/assets/parinaam-logo.png'),
      join(process.cwd(), 'dist/assets/parinaam-logo.png'),
    ];
    const found = candidates.find((c) => existsSync(c));
    if (!found) {
      this.logger.warn('parinaam-logo.png not found — certificates fall back to the text header');
      this.logoBytes = null;
      return null;
    }
    this.logoBytes = readFileSync(found);
    return this.logoBytes;
  }

  async render(data: CertificateData): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([W, H]);

    const serif = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const serifBold = await doc.embedFont(StandardFonts.TimesRomanBoldItalic);
    const sans = await doc.embedFont(StandardFonts.Helvetica);
    const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const center = (font: PDFFont, text: string, size: number) =>
      (W - font.widthOfTextAtSize(text, size)) / 2;

    // ── Background and double border ─────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    page.drawRectangle({
      x: 24, y: 24, width: W - 48, height: H - 48,
      borderColor: INK, borderWidth: 2,
    });
    page.drawRectangle({
      x: 32, y: 32, width: W - 64, height: H - 64,
      borderColor: ACCENT, borderWidth: 1,
    });

    // ── Header: the logo where the asset exists, the wordmark where not ──────
    const logoBytes = this.loadLogo();
    if (logoBytes) {
      const logo = await doc.embedPng(logoBytes);
      // The mark is 301.2 × 165.3 — keep its aspect at a 52pt height.
      const logoH = 52;
      const logoW = (logo.width / logo.height) * logoH;
      page.drawImage(logo, { x: (W - logoW) / 2, y: H - 58 - logoH, width: logoW, height: logoH });
    } else {
      const org = 'PARINAAM FOUNDATION';
      page.drawText(org, {
        x: center(sansBold, org, 13), y: H - 88, size: 13, font: sansBold, color: ACCENT_STRONG,
      });
    }

    const title =
      data.certType === 'corporate' ? 'Thank You for Volunteering' : 'Certificate of Appreciation';
    page.drawText(title, {
      x: center(serifBold, title, 40), y: H - 158, size: 40, font: serifBold, color: INK,
    });

    const sub =
      data.certType === 'corporate'
        ? 'This certificate of appreciation is presented to'
        : 'This is to certify that';
    page.drawText(sub, {
      x: center(sans, sub, 13), y: H - 192, size: 13, font: sans, color: MUTED,
    });

    // ── Name ──────────────────────────────────────────────────────────────────
    page.drawText(data.volunteerName, {
      x: center(serifBold, data.volunteerName, 34),
      y: H - 240, size: 34, font: serifBold, color: ACCENT_STRONG,
    });
    const underlineWidth = serifBold.widthOfTextAtSize(data.volunteerName, 34) + 40;
    page.drawLine({
      start: { x: (W - underlineWidth) / 2, y: H - 252 },
      end: { x: (W + underlineWidth) / 2, y: H - 252 },
      thickness: 0.8, color: ACCENT,
    });

    // ── Body ──────────────────────────────────────────────────────────────────
    const period =
      data.periodStart && data.periodEnd && data.periodStart !== data.periodEnd
        ? `between ${fmtDate(data.periodStart)} and ${fmtDate(data.periodEnd)}`
        : `on ${fmtDate(data.periodStart ?? data.issuedOn)}`;
    const sessions = `${data.eventsAttended} session${data.eventsAttended === 1 ? '' : 's'}`;

    const lines =
      data.certType === 'corporate'
        ? [
            `representing ${data.organizationName ?? 'their organization'}, in recognition of their generous`,
            `contribution of time and resources to the ${data.programName} programme,`,
            `attending ${sessions} ${period} and contributing ${data.hours} hours`,
            'of dedicated service towards building stronger communities.',
          ]
        : [
            'has demonstrated exceptional dedication and commitment by volunteering in the',
            `${data.programName} programme, attending ${sessions} ${period}`,
            `and contributing ${data.hours} hours of impactful service to the community.`,
          ];

    let y = H - 296;
    for (const line of lines) {
      page.drawText(line, { x: center(sans, line, 13), y, size: 13, font: sans, color: INK });
      y -= 22;
    }

    // ── Footer: signature rules, seal, verification ──────────────────────────
    const footerY = 108;
    page.drawLine({ start: { x: 110, y: footerY }, end: { x: 300, y: footerY }, thickness: 0.8, color: INK });
    page.drawText('Programme Director', { x: 110, y: footerY - 18, size: 11, font: sans, color: MUTED });

    // Star seal
    const sealX = W / 2;
    page.drawCircle({ x: sealX, y: footerY + 6, size: 26, borderColor: ACCENT, borderWidth: 1.5 });
    const star = '*';
    page.drawText(star, {
      x: sealX - serif.widthOfTextAtSize(star, 40) / 2, y: footerY - 8,
      size: 40, font: serif, color: ACCENT,
    });

    const issued = `Issued: ${fmtDate(data.issuedOn)}`;
    page.drawLine({ start: { x: W - 300, y: footerY }, end: { x: W - 110, y: footerY }, thickness: 0.8, color: INK });
    page.drawText(issued, {
      x: W - 110 - sans.widthOfTextAtSize(issued, 11), y: footerY - 18,
      size: 11, font: sans, color: MUTED,
    });

    const verify = `Certificate no. ${data.certificateNumber} — verifiable with Parinaam Foundation`;
    page.drawText(verify, {
      x: center(sans, verify, 8.5), y: 48, size: 8.5, font: sans, color: MUTED,
    });

    doc.setTitle(`${title} — ${data.volunteerName}`);
    doc.setAuthor('Parinaam Foundation');

    return Buffer.from(await doc.save());
  }
}
