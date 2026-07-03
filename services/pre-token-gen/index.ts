/**
 * PreTokenGeneration V1_0 Lambda — stamps custom claims into ID token.
 * Per design §2.1: injects tenantId, role, poolClass into the ID token ONLY.
 *
 * Runtime: Node.js 22.x, arm64, 5s timeout (Cognito trigger hard cap).
 *
 * Behavior:
 * 1. Reads custom:tenantId from the user's Cognito attributes.
 * 2. Reads the user's first Cognito group as the role.
 * 3. Determines poolClass from the USER_POOL_ID environment variable mapping.
 * 4. Returns claimsToAddOrOverride with tenantId, role, poolClass.
 *
 * Fallback: If group membership is empty, falls back to 'Employee' and LOGS
 * the fallback (no silent paths per F-8 tightening).
 */

export interface PreTokenGenEvent {
  readonly request: {
    readonly userAttributes: Record<string, string>;
    readonly groupConfiguration: {
      readonly groupsToOverride?: string[];
    };
  };
  readonly response: {
    claimsOverrideDetails?: {
      claimsToAddOrOverride?: Record<string, string>;
    };
  };
  readonly callerContext: {
    readonly clientId: string;
  };
  readonly userPoolId: string;
  readonly userName: string;
}

export type PreTokenGenResult = PreTokenGenEvent;

/**
 * Determine poolClass from the User Pool ID.
 * The pool ID suffix is mapped via POOL_CLASS_MAP environment variable (JSON).
 * Defaults to 'unknown' if not found.
 */
export function resolvePoolClass(userPoolId: string): string {
  const mapJson = process.env.POOL_CLASS_MAP ?? '{}';
  try {
    const map: Record<string, string> = JSON.parse(mapJson);
    return map[userPoolId] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Resolve the user's role from Cognito group membership.
 * Returns the first group name, or 'Employee' fallback with a log warning.
 */
export function resolveRole(groups: string[] | undefined): { role: string; fallback: boolean } {
  if (groups && groups.length > 0) {
    return { role: groups[0], fallback: false };
  }
  // Fallback — no silent paths (F-8 tightening)
  console.warn('[PreTokenGen] No group membership found. Falling back to Employee role.');
  return { role: 'Employee', fallback: true };
}

/**
 * Build the claims to inject into the ID token.
 */
export function buildClaims(
  tenantId: string | undefined,
  role: string,
  poolClass: string,
): Record<string, string> {
  return {
    'custom:tenantId': tenantId ?? '',
    'custom:role': role,
    'custom:poolClass': poolClass,
  };
}

/**
 * Lambda handler — PreTokenGeneration V1_0 trigger.
 */
export async function handler(event: PreTokenGenEvent): Promise<PreTokenGenResult> {
  const { request, userPoolId } = event;

  const tenantId = request.userAttributes['custom:tenantId'];
  const groups = request.groupConfiguration.groupsToOverride;

  const { role, fallback } = resolveRole(groups);
  const poolClass = resolvePoolClass(userPoolId);
  const claims = buildClaims(tenantId, role, poolClass);

  if (fallback) {
    console.warn(
      `[PreTokenGen] user=${event.userName} pool=${userPoolId} — fallback role=Employee`,
    );
  }

  // Mutate event response per Cognito V1_0 contract
  event = {
    ...event,
    response: {
      claimsOverrideDetails: {
        claimsToAddOrOverride: claims,
      },
    },
  };

  return event;
}
