import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { ReportData } from './report-query.service';

const INK = rgb(15 / 255, 43 / 255, 45 / 255);
const MUTED = rgb(94 / 255, 106 / 255, 98 / 255);
const ACCENT = rgb(188 / 255, 83 / 255, 40 / 255);
const ROW_STRIPE = rgb(246 / 255, 242 / 255, 234 / 255);

/**
 * Three renderings of the same ReportData. The exporters format — they never
 * query — so identical filters produce identical rows in every format.
 */
@Injectable()
export class ExportersService {
  csv(report: ReportData): Buffer {
    const escape = (value: unknown): string => {
      const s = value == null ? '' : String(value);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      report.columns.map((c) => escape(c.label)).join(','),
      ...report.rows.map((row) => report.columns.map((c) => escape(row[c.key])).join(',')),
    ];
    // BOM so Excel opens it as UTF-8 rather than the ANSI codepage.
    return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
  }

  async excel(report: ReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Parinaam VMS';
    const sheet = workbook.addWorksheet(report.title.slice(0, 31));

    sheet.columns = report.columns.map((c) => ({
      header: c.label,
      key: c.key,
      width: Math.max(12, c.label.length + 4),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF6F2EA' },
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const row of report.rows) {
      sheet.addRow(
        Object.fromEntries(
          report.columns.map((c) => {
            const value = row[c.key];
            // numerics arrive as strings from pg — store real numbers in cells
            const n = typeof value === 'string' && value !== '' ? Number(value) : value;
            return [c.key, typeof n === 'number' && Number.isFinite(n) ? n : value];
          }),
        ),
      );
    }
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: report.columns.length },
    };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async pdf(report: ReportData, generatedAt: Date): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    // A4 landscape
    const W = 842;
    const H = 595;
    const MARGIN = 36;
    const usable = W - MARGIN * 2;

    // Column widths proportional to header + longest value, normalised.
    const weights = report.columns.map((c) =>
      Math.max(
        c.label.length,
        ...report.rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length),
      ),
    );
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const widths = weights.map((w) => Math.max(40, (w / totalWeight) * usable));
    const widthSum = widths.reduce((a, b) => a + b, 0);
    const scale = usable / widthSum;
    const cols = report.columns.map((c, i) => ({ ...c, width: widths[i] * scale }));

    const SIZE = 7.5;
    const ROW_H = 14;

    const truncate = (text: string, width: number, f: PDFFont): string => {
      if (f.widthOfTextAtSize(text, SIZE) <= width - 6) return text;
      let s = text;
      while (s.length > 1 && f.widthOfTextAtSize(s + '…', SIZE) > width - 6) s = s.slice(0, -1);
      return s + '…';
    };

    let page!: PDFPage;
    let y = 0;

    const drawHeader = (first: boolean) => {
      page = doc.addPage([W, H]);
      y = H - MARGIN;
      if (first) {
        page.drawText('PARINAAM FOUNDATION', { x: MARGIN, y, size: 9, font: bold, color: ACCENT });
        y -= 16;
        page.drawText(report.title, { x: MARGIN, y, size: 16, font: bold, color: INK });
        const stamp = `Generated ${generatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · ${report.rows.length} rows`;
        page.drawText(stamp, {
          x: W - MARGIN - font.widthOfTextAtSize(stamp, 8),
          y: y + 4, size: 8, font, color: MUTED,
        });
        y -= 20;
      }
      // column header row
      let x = MARGIN;
      page.drawRectangle({ x: MARGIN, y: y - 4, width: usable, height: ROW_H, color: ROW_STRIPE });
      for (const c of cols) {
        const label = truncate(c.label, c.width, bold);
        const tx = c.align === 'right'
          ? x + c.width - 3 - bold.widthOfTextAtSize(label, SIZE)
          : x + 3;
        page.drawText(label, { x: tx, y, size: SIZE, font: bold, color: INK });
        x += c.width;
      }
      y -= ROW_H;
    };

    drawHeader(true);
    report.rows.forEach((row, index) => {
      if (y < MARGIN + ROW_H) drawHeader(false);
      if (index % 2 === 1) {
        page.drawRectangle({ x: MARGIN, y: y - 4, width: usable, height: ROW_H, color: ROW_STRIPE });
      }
      let x = MARGIN;
      for (const c of cols) {
        const text = truncate(String(row[c.key] ?? ''), c.width, font);
        const tx = c.align === 'right'
          ? x + c.width - 3 - font.widthOfTextAtSize(text, SIZE)
          : x + 3;
        page.drawText(text, { x: tx, y, size: SIZE, font, color: INK });
        x += c.width;
      }
      y -= ROW_H;
    });

    doc.setTitle(report.title);
    doc.setAuthor('Parinaam Foundation');
    return Buffer.from(await doc.save());
  }
}

export const FORMAT_META = {
  CSV: { ext: 'csv', mime: 'text/csv; charset=utf-8' },
  Excel: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  PDF: { ext: 'pdf', mime: 'application/pdf' },
} as const;
