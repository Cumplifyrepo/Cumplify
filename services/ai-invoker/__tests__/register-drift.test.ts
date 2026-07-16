/**
 * Acceptance-gate test (F-4, D-4 "CI-gated" promise):
 * Parses contracts/model-register.md seat table and asserts that the compiled
 * register-compiled.json matches the Register source of truth.
 *
 * Any drift between SEAT_MAP in compile-register.ts and the Register fails CI.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompiledRegister } from '../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTER_MD_PATH = resolve(__dirname, '../../../contracts/model-register.md');
const COMPILED_PATH = resolve(__dirname, '../data/register-compiled.json');

interface ParsedSeat {
  seatName: string;
  modelId: string;
  status: string;
}

/**
 * Parse the seat assignment tables from model-register.md.
 * Extracts Seat, Assigned Model, and Status from each table.
 */
function parseRegisterMd(): ParsedSeat[] {
  const content = readFileSync(REGISTER_MD_PATH, 'utf-8');
  const seats: ParsedSeat[] = [];

  // Match table rows with | **Seat** | ... pattern
  const seatPattern = /\| \*\*Seat\*\* \| (.+?) \|/g;
  const modelPattern = /\| \*\*Assigned Model\*\* \| `(.+?)` \|/g;
  const statusPattern = /\| \*\*Status\*\* \| (.+?) \|/g;

  const seatMatches = [...content.matchAll(seatPattern)].map((m) => m[1].trim());
  const modelMatches = [...content.matchAll(modelPattern)].map((m) => m[1].trim());
  const statusMatches = [...content.matchAll(statusPattern)].map((m) => {
    const raw = m[1].trim();
    if (raw.startsWith('ASSIGNED')) return 'ASSIGNED';
    if (raw.startsWith('PROVISIONAL')) return 'PROVISIONAL';
    if (raw.startsWith('EXPIRED')) return 'EXPIRED';
    if (raw === '**UNASSIGNED**' || raw.startsWith('UNASSIGNED')) return 'UNASSIGNED';
    return raw;
  });

  for (let i = 0; i < seatMatches.length; i++) {
    seats.push({
      seatName: seatMatches[i],
      modelId: modelMatches[i] ?? '',
      status: statusMatches[i] ?? 'UNKNOWN',
    });
  }

  return seats;
}

/** Map Register seat names to compiled SeatId keys */
const SEAT_NAME_TO_ID: Record<string, string> = {
  'Workhorse (ControlTower, DocStudio, LeadAuditor, CAPAGuru, RiskSentinel, AspectWarden, HazardScout, IncidentInvestigator, ReviewOrchestrator, ComplianceCopilot)':
    'workhorse',
  'Lightweight (RecordsVault, ObjectiveTracker, ContextCartographer, SupplierScout, CompetenceKeeper, EmergencyPlanner, WorkerVoice, NCTriage)':
    'lightweight',
  'ISO 9001 Domain Guru (clause Q&A)': 'guru-9001',
  'ISO 14001 Domain Guru (clause Q&A)': 'guru-14001',
  'ISO 45001 Domain Guru (clause Q&A)': 'guru-45001',
  'Micro (classification, routing, triage)': 'micro',
  'Snapshot (AI Readiness Assessment — unauthenticated, high-volume)': 'snapshot',
  'Editor-AI (ISO document drafting/completion — policies, procedures, CAPA records, work instructions)':
    'editor-ai',
  'Pain-distiller (customer feedback extraction + synthesis)': 'pain-distiller',
  'LegalLedger (statutory/legal-text interpretation — 14001 6.1.3, 45001 6.1.3, 9.1.2)':
    'legal-ledger',
  'Doc-Composer (IMS manual + clause document generation — spec 40)': 'doc-composer',
};

describe('register-drift (CI gate, F-4)', () => {
  it('compiled register matches contracts/model-register.md for all seats', () => {
    const mdSeats = parseRegisterMd();
    const compiled: CompiledRegister = JSON.parse(readFileSync(COMPILED_PATH, 'utf-8'));

    expect(mdSeats.length).toBeGreaterThanOrEqual(Object.keys(compiled.seats).length);

    for (const mdSeat of mdSeats) {
      const seatId = SEAT_NAME_TO_ID[mdSeat.seatName];
      if (!seatId) continue; // Skip seats not in our mapping (shouldn't happen)

      const compiledEntry = compiled.seats[seatId as keyof typeof compiled.seats];
      expect(compiledEntry, `Seat '${seatId}' missing from compiled register`).toBeDefined();

      // Model ID must match (except UNASSIGNED which has empty modelId)
      if (mdSeat.status !== 'UNASSIGNED') {
        expect(compiledEntry.modelId).toBe(mdSeat.modelId);
      }

      // Status must match
      expect(compiledEntry.status).toBe(mdSeat.status);
    }
  });

  it('compiled register has no seats absent from model-register.md', () => {
    const mdSeats = parseRegisterMd();
    const compiled: CompiledRegister = JSON.parse(readFileSync(COMPILED_PATH, 'utf-8'));

    const mdSeatIds = new Set(mdSeats.map((s) => SEAT_NAME_TO_ID[s.seatName]).filter(Boolean));

    for (const compiledSeatId of Object.keys(compiled.seats)) {
      expect(
        mdSeatIds.has(compiledSeatId),
        `Compiled seat '${compiledSeatId}' not found in Register MD`,
      ).toBe(true);
    }
  });
});
