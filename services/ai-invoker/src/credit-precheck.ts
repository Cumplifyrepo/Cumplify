/**
 * Credit balance pre-check (SERVE-9).
 * Before invoking Bedrock, checks tenant's credit balance.
 * Exemptions: incident-reporting and HITL-approval flows NEVER block.
 *
 * Meter key: TENANT#<tenantId>#METER / MONTH#<yyyymm> (D-5).
 */

import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { InvokeError } from './types.js';

const logger = new Logger({ serviceName: 'ai-invoker-credit-precheck' });

const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

/** Tenant credit limit per month (from entitlement/plan — loaded from DDB) */
export interface CreditLimit {
  monthlyGrant: number;
  paygoEnabled: boolean;
  autoRefill: boolean;
  planTier: 'trial' | 'launch' | 'ims-pro' | 'enterprise';
}

/**
 * Check if the tenant has credits available.
 * Returns normally if OK. Throws InvokeError('PAUSED_FOR_CREDITS') if exhausted.
 *
 * @param creditExempt - If true, skip pre-check (incident/HITL exemption)
 */
export async function checkCreditBalance(
  tenantId: string,
  creditExempt: boolean,
): Promise<void> {
  // SERVE-9: incident-reporting and HITL-approval flows NEVER block on credits
  if (creditExempt) {
    logger.info('Credit pre-check skipped (exempt)', { tenantId });
    return;
  }

  const yyyymm = new Date().toISOString().slice(0, 7).replace('-', '');
  const pk = `TENANT#${tenantId}#METER`;
  const sk = `MONTH#${yyyymm}`;

  // Read current meter
  const meterResult = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: pk },
        SK: { S: sk },
      },
      ProjectionExpression: 'creditsUsed',
    }),
  );

  const creditsUsed = parseFloat(meterResult.Item?.creditsUsed?.N ?? '0');

  // Read tenant limit (from entitlement item)
  const limitResult = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: `TENANT#${tenantId}#ENTITLEMENT` },
        SK: { S: 'CREDIT_LIMIT' },
      },
      ProjectionExpression: 'monthlyGrant, paygoEnabled, autoRefill, planTier',
    }),
  );

  if (!limitResult.Item) {
    // No entitlement record = default trial limits
    logger.warn('No entitlement record found, applying trial defaults', { tenantId });
    const trialGrant = 15000; // Part 22: trial = 15,000 credits
    if (creditsUsed >= trialGrant) {
      throw new InvokeError(
        'PAUSED_FOR_CREDITS',
        `Tenant ${tenantId} credit balance exhausted (used: ${creditsUsed.toFixed(0)}, grant: ${trialGrant})`,
      );
    }
    return;
  }

  const monthlyGrant = parseFloat(limitResult.Item.monthlyGrant?.N ?? '0');
  const paygoEnabled = limitResult.Item.paygoEnabled?.BOOL ?? false;
  const autoRefill = limitResult.Item.autoRefill?.BOOL ?? false;
  const planTier = limitResult.Item.planTier?.S ?? 'trial';

  // Enterprise with auto-refill never blocks
  if (planTier === 'enterprise' && autoRefill) {
    return;
  }

  // If PAYG enabled with auto-refill, don't block (overage is billed)
  if (paygoEnabled && autoRefill) {
    return;
  }

  // Hard limit: grant exhausted, no auto-refill
  if (creditsUsed >= monthlyGrant && !autoRefill) {
    throw new InvokeError(
      'PAUSED_FOR_CREDITS',
      `Tenant ${tenantId} credit balance exhausted (used: ${creditsUsed.toFixed(0)}, grant: ${monthlyGrant})`,
    );
  }
}
