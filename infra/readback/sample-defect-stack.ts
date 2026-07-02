/**
 * Spec38SampleDefect — A minimal CDK stack with ONE intentional defect for AC-5.2.
 *
 * Contains: one S3 bucket WITHOUT ObjectLockConfiguration.
 * Purpose: human deploys → readback fails with "observed: undefined, designed: COMPLIANCE"
 *          → evidence captured → human tears down.
 *
 * Stack name: Spec38SampleDefect
 * RemovalPolicy: DESTROY (no data stored)
 *
 * Usage (REQUIRES-HUMAN):
 *   npx cdk deploy Spec38SampleDefect --app "npx tsx infra/readback/sample-defect-stack.ts"
 *   npm run readback  (captures the failure)
 *   npx cdk destroy Spec38SampleDefect --app "npx tsx infra/readback/sample-defect-stack.ts" --force
 */

// NOTE: This file will not compile until aws-cdk-lib is installed (arrives with spec 1).
// It is intentionally committed as a specification artifact, not runnable code at this stage.
// When spec 1 adds aws-cdk-lib, this stack becomes deployable.

/*
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'Spec38SampleDefect', {
  env: { account: '697114252993', region: 'us-east-1' },
});

// INTENTIONAL DEFECT: No ObjectLockConfiguration
new s3.Bucket(stack, 'DefectBucket', {
  bucketName: 'cumplify-spec38-sample-defect',
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
  // MISSING: objectLockEnabled: true + objectLockDefaultRetention
  // The readback test asserts ObjectLockConfiguration.Mode = COMPLIANCE
  // and will FAIL against this bucket.
});
*/

export {};
