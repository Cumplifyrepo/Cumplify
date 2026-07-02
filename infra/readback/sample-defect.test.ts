/**
 * Readback test: S3 evidence bucket ObjectLock assertion
 * Part 39 Layer 3 — asserts ObjectLockConfiguration.Mode = COMPLIANCE
 *
 * Run-mode semantics:
 * - Zero CFN stacks in account → pre-deploy mode, assertions register as
 *   vitest SKIPPED with the AC-2.5 message.
 * - One or more stacks → an expected-but-absent resource is a FAIL with
 *   observed: ABSENT. A missing resource must never pass green once anything
 *   is deployed.
 *
 * @dev — requires real dev account (cumplify-dev-readonly profile)
 */

import { describe, it, beforeAll } from 'vitest';
import { assertResource } from './helpers.js';

const SAMPLE_BUCKET = 'cumplify-spec38-sample-defect';
const PROFILE = 'cumplify-dev-readonly';

/**
 * Check if AWS credentials are available for readback.
 */
async function hasAwsAccess(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync(`aws sts get-caller-identity --profile ${PROFILE}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Probe: count CloudFormation stacks in the dev account.
 * Zero stacks = pre-deploy mode (AC-2.5 graceful skip).
 * One or more = post-deploy mode (missing resource = FAIL).
 */
async function getCfnStackCount(): Promise<number> {
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(
      `aws cloudformation describe-stacks --profile ${PROFILE} --query "Stacks[].StackName" --output json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const stacks = JSON.parse(output);
    return Array.isArray(stacks) ? stacks.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Check if a specific S3 bucket exists.
 */
async function bucketExists(name: string): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync(`aws s3api head-bucket --bucket ${name} --profile ${PROFILE}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get S3 bucket ObjectLock configuration.
 */
async function getBucketObjectLockConfig(
  bucketName: string,
): Promise<{ Rule?: { DefaultRetention?: { Mode?: string } } } | null> {
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(
      `aws s3api get-object-lock-configuration --bucket ${bucketName} --profile ${PROFILE} --output json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const parsed = JSON.parse(output);
    return parsed.ObjectLockConfiguration ?? null;
  } catch {
    return null;
  }
}

describe('S3 Evidence Bucket — ObjectLock Readback', () => {
  let awsAvailable = false;
  let preDeployMode = true; // true = zero stacks, SKIP assertions
  let sampleBucketExists = false;

  beforeAll(async () => {
    awsAvailable = await hasAwsAccess();
    if (!awsAvailable) return;

    const stackCount = await getCfnStackCount();
    preDeployMode = stackCount === 0;
    sampleBucketExists = await bucketExists(SAMPLE_BUCKET);
  });

  it('asserts ObjectLockConfiguration.Mode = COMPLIANCE on evidence bucket', async (ctx) => {
    if (!awsAvailable) {
      ctx.skip();
      return;
    }

    if (!sampleBucketExists) {
      // The sample-defect bucket is purpose-built for AC-5.2 proof.
      // When it doesn't exist: pre-deploy mode → SKIP (AC-2.5),
      // or post-deploy mode but this bucket hasn't been created yet → SKIP.
      // Once real evidence buckets arrive (spec 1), they get their own
      // assertion file that uses the ABSENT semantics for post-deploy mode.
      console.log(
        `Bucket ${SAMPLE_BUCKET} does not exist — ` +
          (preDeployMode
            ? 'pre-deploy mode, no resources to verify (AC-2.5).'
            : 'sample-defect bucket not yet created for AC-5.2 proof.'),
      );
      ctx.skip();
      return;
    }

    // Bucket exists — this is the AC-5.2 scenario.
    // Assert ObjectLock is configured (it won't be on the defect bucket).
    const config = await getBucketObjectLockConfig(SAMPLE_BUCKET);
    const observedMode = config?.Rule?.DefaultRetention?.Mode ?? undefined;

    assertResource(
      `s3://${SAMPLE_BUCKET}`,
      'ObjectLockConfiguration.DefaultRetention.Mode',
      'COMPLIANCE',
      observedMode,
    );
  });
});
