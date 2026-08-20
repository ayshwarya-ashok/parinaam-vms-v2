#!/usr/bin/env node
/**
 * R4 guard: the n8n workflow running in the container must match the exported
 * file in the repo. Someone editing a live workflow in the n8n UI and not
 * exporting it is how email delivery silently diverges from code review.
 *
 * Compares the semantic parts (node types, parameters, connections) and
 * ignores UI noise (positions, ids, timestamps).
 *
 * Usage: node scripts/n8n-drift-check.mjs
 * Exits non-zero on drift or if the live workflow is missing/inactive.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const FILE = 'n8n/workflows/vms-email-dispatch.json';
const WORKFLOW_ID = 'vmsEmailDispatch1';

function normalize(workflow) {
  const nodes = [...workflow.nodes]
    .map((n) => ({ name: n.name, type: n.type, parameters: n.parameters, disabled: n.disabled ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.stringify({ nodes, connections: workflow.connections }, null, 1);
}

const repo = JSON.parse(readFileSync(FILE, 'utf8'));

let liveRaw;
try {
  execSync(
    `docker compose exec -T n8n n8n export:workflow --id=${WORKFLOW_ID} --output=/tmp/live.json`,
    { stdio: 'pipe' },
  );
  liveRaw = execSync('docker compose exec -T n8n cat /tmp/live.json', { stdio: 'pipe' }).toString();
} catch (err) {
  console.error(`Could not export live workflow ${WORKFLOW_ID}: ${err.message}`);
  process.exit(2);
}

const liveExport = JSON.parse(liveRaw);
const live = Array.isArray(liveExport) ? liveExport[0] : liveExport;

if (live.active === false) {
  console.error(`DRIFT: workflow ${WORKFLOW_ID} is INACTIVE in n8n — emails are not flowing.`);
  process.exit(1);
}

const a = normalize(repo);
const b = normalize(live);
if (a !== b) {
  console.error(`DRIFT: live workflow ${WORKFLOW_ID} differs from ${FILE}.`);
  console.error('Either re-import the file (n8n import:workflow) or export the live one and commit it.');
  const al = a.split('\n');
  const bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i += 1) {
    if (al[i] !== bl[i]) {
      console.error(`  first difference at normalized line ${i + 1}:`);
      console.error(`    repo: ${al[i] ?? '<missing>'}`);
      console.error(`    live: ${bl[i] ?? '<missing>'}`);
      break;
    }
  }
  process.exit(1);
}

console.log(`n8n drift check: live ${WORKFLOW_ID} matches ${FILE} and is active.`);
