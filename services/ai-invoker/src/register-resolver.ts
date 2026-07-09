/**
 * Register resolver — loads the build-time compiled register and resolves
 * seat → modelId at invoke time. Fails closed on EXPIRED/UNASSIGNED.
 *
 * Design §1.3 — agents-existing-8.
 * Trade-off (D-4): build-time map = redeploy on reassignment (CI-gated, safer).
 * Expiry date-check is LIVE at invoke time regardless.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CompiledRegister, SeatId, SeatEntry } from './types.js';
import { InvokeError } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTER_PATH = resolve(__dirname, '../data/register-compiled.json');

/** Cold-cached register (loaded once per Lambda cold start) */
let cachedRegister: CompiledRegister | null = null;

/**
 * Load the compiled register. Cold-cached in Lambda memory.
 * Exported for testing (allows injection).
 */
export function loadRegister(path?: string): CompiledRegister {
  if (cachedRegister && !path) return cachedRegister;
  const content = readFileSync(path ?? REGISTER_PATH, 'utf-8');
  const register = JSON.parse(content) as CompiledRegister;
  if (!path) cachedRegister = register;
  return register;
}

/** Reset cached register (for testing) */
export function resetCache(): void {
  cachedRegister = null;
}

/**
 * Resolve a seat to its model ID. Fails closed if:
 * - Seat status is EXPIRED or UNASSIGNED
 * - Seat expiry date is in the past (LIVE check at invoke time)
 */
export function resolveModel(seat: SeatId, register?: CompiledRegister): SeatEntry {
  const reg = register ?? loadRegister();
  const entry = reg.seats[seat];

  if (!entry) {
    throw new InvokeError('MODEL_SEAT_EXPIRED', `Seat '${seat}' not found in register`);
  }

  // Status check
  if (entry.status === 'UNASSIGNED') {
    throw new InvokeError('MODEL_SEAT_UNASSIGNED', `Seat '${seat}' is UNASSIGNED — no model assigned`);
  }
  if (entry.status === 'EXPIRED') {
    throw new InvokeError('MODEL_SEAT_EXPIRED', `Seat '${seat}' is EXPIRED — re-validation required`);
  }

  // Live expiry date check (D-4: runs at invoke time regardless of build-time map)
  if (entry.expiry) {
    const expiryDate = new Date(entry.expiry);
    const now = new Date();
    if (now > expiryDate) {
      throw new InvokeError(
        'MODEL_SEAT_EXPIRED',
        `Seat '${seat}' expired on ${entry.expiry} — re-validation required`,
      );
    }
  }

  return entry;
}
