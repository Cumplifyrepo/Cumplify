/**
 * Billing resolver — Stripe Customer Portal integration.
 *
 * createBillingPortalSession: mints a one-time Stripe Billing Portal URL for the
 * caller's tenant. The /billing page's "Manage subscription" button calls this
 * and redirects, so admins manage their subscription, invoices, and payment
 * method in Stripe's hosted portal (no PCI surface in our app).
 *
 * PLACEMENT: NOT VPC-placed (like the m1–m5 resolvers) — the zero-NAT VPC has no
 * egress to api.stripe.com, so this Lambda runs outside the VPC and reaches
 * Stripe over the default managed egress. rds-data / Secrets Manager are public
 * AWS endpoints, so nothing here needs the VPC.
 *
 * SECRET (cumplify/<env>/stripe) carries the Stripe secret key, the portal
 * configuration id, and the tenant→customer map (seeded out-of-band). A future
 * spec moves the tenant→customer mapping onto the tenant record and adds the
 * Checkout subscribe flow + webhook sync → entitlements.
 *
 * SCHEMA-5: tenantId comes ONLY from resolverContext (extractContext), never
 * from input args. returnUrl is client-supplied post-portal navigation and is
 * validated to an http(s) URL.
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import Stripe from 'stripe';
import { extractContext } from './shared.js';

const logger = new Logger({ serviceName: 'resolver-billing' });
const sm = new SecretsManagerClient({});

interface StripeSecret {
  secretKey: string;
  portalConfigurationId?: string;
  customersByTenant?: Record<string, string>;
}

interface AppSyncEvent {
  info: { fieldName: string };
  arguments: Record<string, unknown>;
  identity?: { resolverContext?: Record<string, string> };
}

/**
 * Read + parse the Stripe secret on each call. STRIPE_SECRET_NAME is read at
 * CALL time (not module scope) so the hermetic lane can set it before import
 * and never hit AWS. Portal opens are an infrequent admin action — no cache.
 */
async function loadStripe(): Promise<{ secret: StripeSecret; stripe: Stripe }> {
  const secretName = process.env.STRIPE_SECRET_NAME;
  if (!secretName) throw new Error('STRIPE_NOT_CONFIGURED: STRIPE_SECRET_NAME unset');
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretName }));
  if (!resp.SecretString) throw new Error('STRIPE_NOT_CONFIGURED: empty secret');
  const secret = JSON.parse(resp.SecretString) as StripeSecret;
  if (!secret.secretKey) throw new Error('STRIPE_NOT_CONFIGURED: secretKey missing');
  return { secret, stripe: new Stripe(secret.secretKey) };
}

export async function handler(event: AppSyncEvent): Promise<unknown> {
  const { tenantId } = extractContext(event);
  logger.appendKeys({ tenantId, requestField: event.info.fieldName });

  switch (event.info.fieldName) {
    case 'createBillingPortalSession':
      return createBillingPortalSession(event, tenantId);
    default:
      throw new Error(`Unknown field: ${event.info.fieldName}`);
  }
}

async function createBillingPortalSession(
  event: AppSyncEvent,
  tenantId: string,
): Promise<{ url: string }> {
  const returnUrl = event.arguments.returnUrl as string | undefined;
  if (!returnUrl || !/^https?:\/\//.test(returnUrl)) {
    throw new Error('INVALID_RETURN_URL');
  }

  const { secret, stripe } = await loadStripe();

  // One Stripe customer per tenant. Seeded tenants resolve from the map;
  // otherwise stamp a bare customer with the tenantId (production: persist the
  // id on the tenant record so repeat calls for a new tenant never re-create).
  let customerId = secret.customersByTenant?.[tenantId];
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { tenantId } });
    customerId = customer.id;
    logger.info('Created Stripe customer for tenant', { customerId });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
    ...(secret.portalConfigurationId ? { configuration: secret.portalConfigurationId } : {}),
  });

  logger.info('Created billing portal session', { customerId });
  return { url: session.url };
}
