import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { degrees, PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import { BusinessException } from '../../common';

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

const INK = rgb(31 / 255, 43 / 255, 54 / 255);
const ACCENT = rgb(38 / 255, 145 / 255, 208 / 255);
const ACCENT_STRONG = rgb(27 / 255, 110 / 255, 160 / 255);
const MUTED = rgb(94 / 255, 110 / 255, 126 / 255);
const CREAM = rgb(247 / 255, 250 / 255, 253 / 255);

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Wrap and auto-size the custom body paragraph into the editable band.
 * Steps down through the template's own size first (12.5pt / 3 lines — the
 * printed paragraph's exact rhythm), then two tighter settings; a single
 * word wider than the band fails rather than overflowing. Returns null when
 * nothing fits — the caller refuses the text instead of distorting the page.
 */
function fitBodyText(
  text: string,
  font: PDFFont,
  band: { top: number; bottom: number; maxWidth: number },
): { lines: string[]; size: number; lineHeight: number } | null {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length === 0 || words[0] === '') return null;

  const settings = [
    { size: 12.5, lineHeight: 17.5, maxLines: 3 },
    { size: 11.5, lineHeight: 15.5, maxLines: 3 },
    { size: 10.5, lineHeight: 12.8, maxLines: 4 },
  ];

  for (const s of settings) {
    const lines: string[] = [];
    let current = '';
    let overflow = false;
    for (const word of words) {
      if (font.widthOfTextAtSize(word, s.size) > band.maxWidth) { overflow = true; break; }
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, s.size) <= band.maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (overflow) continue;
    if (current) lines.push(current);
    const blockHeight = (lines.length - 1) * s.lineHeight + s.size * 0.72;
    if (lines.length <= s.maxLines && blockHeight <= band.top - band.bottom) {
      return { lines, size: s.size, lineHeight: s.lineHeight };
    }
  }
  return null;
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

  /** The client's official artwork, read once per variant. */
  private templateBytes: Partial<Record<'individual' | 'corporate', Buffer | null>> = {};

  private loadTemplate(type: 'individual' | 'corporate'): Buffer | null {
    if (this.templateBytes[type] !== undefined) return this.templateBytes[type]!;
    const name = `certificate-template-${type}.pdf`;
    const candidates = [
      join(__dirname, '../../assets/', name),
      join(process.cwd(), 'src/assets/', name),
      join(process.cwd(), 'dist/assets/', name),
    ];
    const found = candidates.find((c) => existsSync(c));
    this.templateBytes[type] = found ? readFileSync(found) : null;
    if (!found) this.logger.warn(`${name} not found — falling back to the drawn certificate`);
    return this.templateBytes[type]!;
  }

  /**
   * Certificates ARE the client's sample PDFs (2026-09-25): the official
   * artwork is loaded as the page itself — border, logo, wording, Mallika
   * Ghosh's signature, the Goodhearts mark all pixel-identical — and only the
   * dynamic text is overlaid: the recipient's name on the presentation line,
   * one small caption with the system facts (certificate number, program,
   * sessions, hours — the figures reissue logic compares), and the issue
   * date on the date line. The legacy drawn layout remains as the fallback
   * when the template assets are missing.
   */
  async render(data: CertificateData): Promise<Buffer> {
    const tpl = this.loadTemplate(data.certType);
    if (!tpl) return this.renderLegacy(data);

    const doc = await PDFDocument.load(tpl);
    const page = doc.getPage(0);
    const { width } = page.getSize(); // 792 x 612 (Letter landscape)
    const sans = await doc.embedFont(StandardFonts.Helvetica);
    const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const sansItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const centerX = width / 2;

    // The two templates place their fields a little differently (the corporate
    // body runs four lines) — coordinates measured with a ruler overlay
    // rendered onto each template, in points from the bottom-left.
    const GEOM = {
      individual: { captionY: 302, whiteout: { y: 299, h: 15.8 }, nameY: 322, dateY: 141.5 },
      corporate: { captionY: 310, whiteout: { y: 307, h: 17 }, nameY: 331, dateY: 135.5 },
    }[data.certType];

    // The template prints a field label under the name line; the issued
    // certificate replaces it with the facts caption, so paint it out first
    // (the band stops short of the rule above it).
    page.drawRectangle({
      x: centerX - 165, y: GEOM.whiteout.y, width: 330, height: GEOM.whiteout.h, color: rgb(1, 1, 1),
    });

    // Recipient name, auto-sized to stay on the line.
    let nameSize = 24;
    while (nameSize > 12 && sansBold.widthOfTextAtSize(data.volunteerName, nameSize) > 380) nameSize -= 1;
    page.drawText(data.volunteerName, {
      x: centerX - sansBold.widthOfTextAtSize(data.volunteerName, nameSize) / 2,
      y: GEOM.nameY,
      size: nameSize,
      font: sansBold,
      color: INK,
    });

    // The system facts, in the quiet style of the label they replace.
    const sessions = `${data.eventsAttended} session${data.eventsAttended === 1 ? '' : 's'}`;
    const caption = [
      data.certificateNumber,
      data.certType === 'corporate' && data.organizationName ? `via ${data.organizationName}` : null,
      data.programName,
      `${sessions} · ${data.hours} volunteer hours`,
    ].filter(Boolean).join('  ·  ');
    page.drawText(caption, {
      x: centerX - sansItalic.widthOfTextAtSize(caption, 8.5) / 2,
      y: GEOM.captionY,
      size: 8.5,
      font: sansItalic,
      color: MUTED,
    });

    // Issue date on the date line (right-hand rule beside the signature).
    const dateText = fmtDate(data.issuedOn);
    page.drawText(dateText, {
      x: 562 - sans.widthOfTextAtSize(dateText, 10.5) / 2,
      y: GEOM.dateY,
      size: 10.5,
      font: sans,
      color: INK,
    });

    return Buffer.from(await doc.save());
  }

  /**
   * Custom certificate (Round 48): the official appreciation artwork with ONE
   * editable region — the body paragraph between the recipient line and the
   * "Presented through Goodhearts" strapline. Everything else (logo, title,
   * signature, Goodhearts mark) is the fixed template.
   *
   * The region was measured off the artwork with a ruler overlay: the printed
   * paragraph's three lines sit on baselines ≈278 / 260.5 / 243pt, bounded by
   * the name-label band above (~299) and the cyan strapline below (cap top
   * ≈234). User text is wrapped and auto-sized to stay inside that band; text
   * that cannot fit even at the smallest size is refused rather than ever
   * distorting the layout.
   */
  async renderCustom(data: {
    certificateNumber: string;
    volunteerName: string;
    bodyText: string;
    issuedOn: string;
    preview?: boolean;
  }): Promise<Buffer> {
    const tpl = this.loadTemplate('individual');
    if (!tpl) {
      throw new BusinessException(
        'TEMPLATE_MISSING',
        'The certificate artwork is not installed on this server — custom certificates need it.',
        503,
      );
    }

    const doc = await PDFDocument.load(tpl);
    const page = doc.getPage(0);
    const { width } = page.getSize();
    const sans = await doc.embedFont(StandardFonts.Helvetica);
    const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const sansItalic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const centerX = width / 2;

    // The editable band (points from the bottom-left of the Letter page).
    const BAND = { top: 288, bottom: 240, maxWidth: 620 };

    const fit = fitBodyText(data.bodyText, sans, BAND);
    if (!fit) {
      throw new BusinessException(
        'TEXT_TOO_LONG',
        'That text does not fit the certificate — shorten it; the layout is never squeezed.',
        400,
      );
    }

    // Paint out the template's fixed paragraph, then the name-label band —
    // same treatment the program certificate gives the label.
    page.drawRectangle({ x: 76, y: 237, width: 640, height: 52, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: centerX - 165, y: 299, width: 330, height: 15.8, color: rgb(1, 1, 1) });

    // Recipient name on the presentation line, auto-sized like the original.
    let nameSize = 24;
    while (nameSize > 12 && sansBold.widthOfTextAtSize(data.volunteerName, nameSize) > 380) nameSize -= 1;
    page.drawText(data.volunteerName, {
      x: centerX - sansBold.widthOfTextAtSize(data.volunteerName, nameSize) / 2,
      y: 322,
      size: nameSize,
      font: sansBold,
      color: INK,
    });

    // The quiet caption under the name: the number on an issued certificate,
    // an unmissable notice on a preview.
    const caption = data.preview ? 'PREVIEW — not issued' : data.certificateNumber;
    page.drawText(caption, {
      x: centerX - sansItalic.widthOfTextAtSize(caption, 8.5) / 2,
      y: 302,
      size: 8.5,
      font: sansItalic,
      color: MUTED,
    });

    // The staff-written paragraph, centered line by line like the original.
    const bandMid = (BAND.top + BAND.bottom) / 2;
    let baseline = bandMid + ((fit.lines.length - 1) * fit.lineHeight) / 2 - fit.size * 0.36;
    for (const line of fit.lines) {
      page.drawText(line, {
        x: centerX - sans.widthOfTextAtSize(line, fit.size) / 2,
        y: baseline,
        size: fit.size,
        font: sans,
        color: INK,
      });
      baseline -= fit.lineHeight;
    }

    // Issue date on the date line.
    const dateText = fmtDate(data.issuedOn);
    page.drawText(dateText, {
      x: 562 - sans.widthOfTextAtSize(dateText, 10.5) / 2,
      y: 141.5,
      size: 10.5,
      font: sans,
      color: INK,
    });

    if (data.preview) {
      page.drawText('PREVIEW', {
        x: 170,
        y: 140,
        size: 110,
        font: sansBold,
        color: rgb(0.55, 0.6, 0.66),
        opacity: 0.16,
        rotate: degrees(30),
      });
    }

    doc.setTitle(`Certificate of Appreciation — ${data.volunteerName}`);
    doc.setAuthor('Parinaam Foundation');
    return Buffer.from(await doc.save());
  }

  private async renderLegacy(data: CertificateData): Promise<Buffer> {
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
            `contribution of time and resources to the ${data.programName} program,`,
            `attending ${sessions} ${period} and contributing ${data.hours} hours`,
            'of dedicated service towards building stronger communities.',
          ]
        : [
            'has demonstrated exceptional dedication and commitment by volunteering in the',
            `${data.programName} program, attending ${sessions} ${period}`,
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
    page.drawText('Program Director', { x: 110, y: footerY - 18, size: 11, font: sans, color: MUTED });

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
