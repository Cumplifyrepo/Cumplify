/**
 * Shared constants for the ISO KB seeding and guru retrieval path.
 * Spec: iso-kb-seeding.
 */

/**
 * Canon tenant ID for the ISO standards knowledge base.
 * Used as the metadata.tenantId filter value for guru retrieval against
 * the ISO-KB collection. NOT a real tenant — platform-owned content.
 */
export const ISO_CANON_TENANT_ID = '__ISO_CANON__';

/**
 * D-5: Golden chunk count — pinned so source drift is caught in the unit
 * lane, not discovered at deploy. Updated only when iso-requirements-map.md
 * legitimately gains/loses sub-clauses.
 */
export const EXPECTED_CHUNK_COUNT = 109;
