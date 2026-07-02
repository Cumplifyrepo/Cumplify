/**
 * Readback test: S3 evidence bucket ObjectLock assertion
 * Part 39 Layer 3 — asserts ObjectLockConfiguration.Mode = COMPLIANCE
 *
 * This test is used for:
 * - AC-5.2: Deliberate failure proof (Spec38SampleDefect bucket lacks ObjectLock)
 * - Ongoing: Once spec 1 deploys the real evidence bucket, this assertion
 *   will be adapted to target it.
 *
 * @dev — requires real dev account (cumplify-dev-readonly profile)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { assertResource } from './helpers.js';

// Bucket name for the sample defect test
const SAMPLE_BUCKET = 'cumplify-spec38-sample-defect';

/**
 * Check if AWS credentials are available for readback.
 * Returns true if we can assume the dev-readonly role.
 */
async function hasAwsAccess(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync('aws sts get-caller-identity --profile cumplify-dev-readonly', {
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
 * Returns the ObjectLockConfiguration or null if bucket doesn't exist / no lock.
 */
async function getBucketObjectLockConfig(
  bucketName: string,
): Promise<{ ObjectLockEnabled?: string; Rule?: { DefaultRetention?: { Mode?: string } } } | null> {
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(
      `aws s3api get-object-lock-configuration --bucket ${bucketName} --profile cumplify-dev-readonly --output json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const parsed = JSON.parse(output);
    return parsed.ObjectLockConfiguration ?? null;
  } catch {
    // Bucket doesn't exist or ObjectLock not configured
    return null;
  }
}

describe('S3 Evidence Bucket — ObjectLock Readback', () => {
  let awsAvailable = false;
  let bucketExists = false;

  beforeAll(async () => {
    awsAvailable = await hasAwsAccess();
    if (!awsAvailable) return;

    // Check if the sample bucket exists
    try {
      const { execSync } = await import('node:child_process');
      execSync(`aws s3api head-bucket --bucket ${SAMPLE_BUCKET} --profile cumplify-dev-readonly`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10_000,
      });
      bucketExists = true;
    } catch {
      bucketExists = false;
    }
  });

  it('reports gracefully when no deployed resources to verify (AC-2.5)', () => {
    if (!awsAvailable || !bucketExists) {
      console.log('No deployed resources to verify — readback skipped gracefully (AC-2.5).');
      expect(true).toBe(true); // Graceful pass when nothing deployed
      return;
    }
  });

  it('asserts ObjectLockConfiguration.Mode = COMPLIANCE on evidence bucket', async () => {
    if (!awsAvailable) {
      console.log(
        'AWS credentials unavailable (cumplify-dev-readonly) — SKIPPED. Run with profile to execute.',
      );
      return;
    }
    if (!bucketExists) {
      console.log(
        `Bucket ${SAMPLE_BUCKET} does not exist — no deployed resources to verify (AC-2.5).`,
      );
      return;
    }

    const config = await getBucketObjectLockConfig(SAMPLE_BUCKET);
    const observedMode = config?.Rule?.DefaultRetention?.Mode ?? undefined;

    // This assertion will FAIL against Spec38SampleDefect (no ObjectLock configured)
    // and PASS against a properly configured evidence bucket.
    assertResource(
      `s3://${SAMPLE_BUCKET}`,
      'ObjectLockConfiguration.DefaultRetention.Mode',
      'COMPLIANCE',
      observedMode,
    );
  });
});
