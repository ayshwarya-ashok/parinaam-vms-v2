#!/usr/bin/env node
/**
 * Materialise the seeded training documents.
 *
 * The demo seeds reference files under uploads/seed/ that no installer ships,
 * so every "Open" click 404s on a fresh stack. This script renders a real,
 * readable PDF for each seed material (pdf-lib — same engine as certificates),
 * writes it under UPLOAD_DIR/seed/, and points the row at it. Non-PDF seed
 * placeholders (docx/pptx/mp4) become PDFs too: the demo needs documents that
 * actually open, not extension variety.
 *
 * Run INSIDE the api container (needs pdf-lib, pg and the uploads volume):
 *   docker compose exec -T api node /app/../scripts/... — or copy, see runbook.
 * Idempotent: re-running regenerates the same paths.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/uploads';
const INK = rgb(15 / 255, 43 / 255, 45 / 255);
const ACCENT = rgb(188 / 255, 83 / 255, 40 / 255);
const MUTED = rgb(94 / 255, 106 / 255, 98 / 255);

// Body copy per material, keyed by seed basename. Generic fallback otherwise.
const BODIES = {
  't1-handbook': ['Welcome to the Parinaam volunteer community. This handbook walks you through how programmes, activities and sessions fit together, what is expected of you in the field, and where to turn when something goes wrong.', 'Your journey has four stages: onboarding, training, active service and recognition. Each session you attend records real hours and real beneficiaries — accuracy in your attendance reports is what makes our impact figures trustworthy.', 'Always wear your volunteer identification at venues, follow the field coordinator’s instructions, and never share beneficiary information outside the programme team.'],
  't1-welcome': ['Parinaam Foundation works across health, education and community development programmes. This orientation deck introduces the people, the mission and the standards we hold ourselves to.', 'You will meet your field coordinators during your first session. They run the day, submit the occurrence report, and are your first point of contact for anything unexpected.'],
  't2-manual': ['This manual covers scene safety, primary assessment (DRSABC), wound care, fractures and sprains, burns, and when to escalate to emergency services.', 'Rule one is always the same: do not become the second casualty. Assess danger before approaching, announce yourself, and delegate the emergency call to a specific bystander by pointing at them.', 'Every kit at a Parinaam venue contains gloves, sterile dressings, a resuscitation mask, triangular bandages and a first aid log. Replace what you use and record it in the log.'],
  't2-cpr': ['Cardiopulmonary resuscitation procedure: confirm unresponsiveness, call for help, position on a firm surface, 30 compressions to 2 rescue breaths at 100–120 compressions per minute, depth 5–6 cm for adults.', 'Continue until the person responds, professional help takes over, or you are physically unable to continue. If an AED is available, attach it as soon as possible and follow its prompts.'],
  't2-response': ['Emergency response walkthrough (transcript): this document replaces the seeded video placeholder with the narrated content of the demonstration, covering scene assessment, casualty communication and handover to paramedics.'],
  't3-policy': ['Every child in a Parinaam programme has the right to safety, dignity and privacy. This policy defines prohibited conduct, the two-adult rule, appropriate communication channels and photography consent requirements.', 'No volunteer is ever alone with a single child out of sight of others. Photography requires a signed guardian consent form and programme-lead approval; personal devices must not store beneficiary images.'],
  't3-reporting': ['Recognition and reporting guide: physical, behavioural and situational indicators of abuse, and the exact reporting chain — field coordinator, programme lead, child protection officer — with mandatory timelines.', 'If a child discloses to you: listen, reassure, do not promise secrecy, do not investigate yourself, record their words verbatim as soon as possible, and report the same day.'],
  't4-outreach': ['Outreach techniques: door-to-door engagement, community meetings, working with local leaders, and respectful communication across language and literacy differences.', 'Lead with listening. The most effective outreach volunteers spend twice as long understanding a household’s situation as they do presenting the programme.'],
  't5-handbook': ['Mental health awareness handbook: recognising distress in beneficiaries and fellow volunteers, psychological first aid, active listening, and referral pathways to professional support.', 'You are not expected to counsel anyone. Your role is to notice, to listen without judgement, and to connect the person with the programme’s referral list.'],
  'tc1-overview': ['The Protection of Children from Sexual Offences (POCSO) Act, 2012 provides for the protection of children from offences of sexual assault, harassment and pornography, with child-friendly reporting and trial procedures.', 'Under Section 19, ANY person who has knowledge or apprehension of an offence must report it — volunteers included. Failure to report is itself punishable under Section 21.'],
  'tc1-reporting': ['Mandatory reporting guidelines under POCSO: what triggers the duty, whom to inform (Special Juvenile Police Unit or local police), what to record, and how Parinaam supports you through the process.', 'Never screen, verify or investigate a disclosure yourself — the duty is to report, not to judge. Parinaam’s child protection officer will accompany any volunteer through a report.'],
  'tc2-policy': ['The Sexual Harassment of Women at Workplace (Prevention, Prohibition and Redressal) Act, 2013 — the POSH Act — applies to every Parinaam venue and event. This document covers definitions, prohibited conduct and the complaint process.', 'Harassment includes unwelcome physical contact, demands for favours, sexually coloured remarks, showing pornography, and any other unwelcome conduct of a sexual nature — physical, verbal or non-verbal.'],
  'tc2-icc': ['Internal Complaints Committee procedures: composition, how to file a complaint (within 3 months, extendable), the 90-day inquiry timeline, interim reliefs, and confidentiality obligations under Section 16.'],
  'tc3-nda': ['Volunteer non-disclosure agreement: beneficiary personal data, programme records, donor information and internal reports are confidential. This obligation survives the end of your volunteering.', 'Sharing beneficiary stories publicly requires written consent from the beneficiary (or guardian) AND the programme lead — anonymisation alone is not sufficient.'],
};

function wrap(text, font, size, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(probe, size) > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = probe;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function renderDoc(title, trainingName, paragraphs) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595; // A4 portrait
  const H = 842;
  const M = 64;

  let page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: ACCENT });
  page.drawText('PARINAAM FOUNDATION — TRAINING MATERIAL', { x: M, y: H - 60, size: 9, font: bold, color: ACCENT });
  let y = H - 100;
  for (const line of wrap(title, bold, 24, W - M * 2)) {
    page.drawText(line, { x: M, y, size: 24, font: bold, color: INK });
    y -= 30;
  }
  page.drawText(trainingName, { x: M, y, size: 12, font, color: MUTED });
  y -= 36;

  const body = paragraphs.length
    ? paragraphs
    : [`This document accompanies the "${trainingName}" training. Read it fully before attempting the quiz.`];
  for (const para of body) {
    for (const line of wrap(para, font, 11.5, W - M * 2)) {
      if (y < M + 40) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      page.drawText(line, { x: M, y, size: 11.5, font, color: INK });
      y -= 17;
    }
    y -= 12;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${title} — page ${i + 1} of ${pages.length}`, { x: M, y: 36, size: 8, font, color: MUTED });
  });
  doc.setTitle(title);
  doc.setAuthor('Parinaam Foundation');
  return Buffer.from(await doc.save());
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows } = await client.query(
  `SELECT m.id, m.name, m.file_path, t.name AS training_name
   FROM training_materials m JOIN trainings t ON t.id = m.training_id
   WHERE m.file_path LIKE 'seed/%'`,
);

for (const row of rows) {
  const base = row.file_path.replace(/^seed\//, '').replace(/\.[a-z0-9]+$/i, '');
  const pdfName = row.name.replace(/\.[a-z0-9]+$/i, '') + '.pdf';
  const relPath = `seed/${base}.pdf`;
  const buffer = await renderDoc(pdfName.replace(/\.pdf$/, ''), row.training_name, BODIES[base] ?? []);

  const absolute = join(UPLOAD_DIR, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, buffer);

  const kb = (buffer.byteLength / 1024).toFixed(1);
  await client.query(
    `UPDATE training_materials
     SET name = $2, file_path = $3, file_type = 'pdf', mime_type = 'application/pdf',
         file_size_bytes = $4, file_size_text = $5, content_hash = $6, pages = $7
     WHERE id = $1`,
    [row.id, pdfName, relPath, buffer.byteLength, `${kb} KB`,
     createHash('sha256').update(buffer).digest('hex'), null],
  );
  console.log(`✓ ${relPath} (${kb} KB) — ${row.training_name}`);
}

await client.end();
console.log(`Generated ${rows.length} seed material PDFs.`);
