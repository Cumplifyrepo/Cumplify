/**
 * Types for the immutable audit trail.
 */

/** Shape of a stored audit-trail item in CumplifyCore. */
export interface AuditItem {
  PK: string; // TENANT#<tenantId>#AUDITLOG
  SK: string; // EVENT#<appendTimestamp>#<ulid>
  itemType: 'AUDITLOG';
  eventType: string;
  actor: string;
  module: string;
  clauseRef: string;
  standard: 'ISO9001' | 'ISO14001' | 'ISO45001';
  eventTimestamp: string; // original envelope timestamp
  eventId: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  prevHash: string;
  docVersionHash?: string;
}

/** Result returned by appendAuditEvent on success. */
export interface AppendResult {
  pk: string;
  sk: string;
  payloadHash: string;
  prevHash: string;
}

/** Result from a single-tenant verification run. */
export interface VerifierTenantResult {
  tenantId: string;
  itemsChecked: number;
  chainValid: boolean;
  s3Mismatches: number;
  brokenLinks: Array<{
    eventId: string;
    expected: string;
    actual: string;
    type: 'prevHash' | 'payloadHash';
  }>;
}
