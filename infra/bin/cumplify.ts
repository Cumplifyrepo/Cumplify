#!/usr/bin/env node
/**
 * CDK app entrypoint — synthesizes PipelineStack (mgmt) + CumplifyStage per env.
 * Per AC-1.1, design §1.1.
 */

import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { PipelineStack } from '../lib/pipeline-stack.js';
import { MGMT_ACCOUNT, PRIMARY_REGION } from '../lib/env-config.js';

const app = new cdk.App();

// PipelineStack lives in the management account (AC-1.1)
const pipelineStack = new PipelineStack(app, 'CumplifyPipeline', {
  env: { account: MGMT_ACCOUNT, region: PRIMARY_REGION },
});

// AC-1.6: CDK Nag — all warnings = failures (Cumplify rule).
// Stage-level stacks apply AwsSolutionsChecks internally in CumplifyStage.
// PipelineStack is NOT audited by CDK Nag at synth time because:
// 1. CDK Pipelines generates IAM roles with inherent Resource:'*' wildcards
//    for cross-account artifact access, KMS, CodeBuild (framework-generated).
// 2. Applying Aspects from PipelineStack scope incorrectly visits stage
//    assembly resources causing false-positive errors.
// Pipeline security is enforced via CloudTrail + REQUIRES-HUMAN review (task 1.3).
// Stack-level suppressions below document the accepted patterns for auditors.
NagSuppressions.addStackSuppressions(pipelineStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason:
      'PipelineStack contains only framework-generated pipeline constructs; no application resources in this stack.',
  },
  {
    id: 'AwsSolutions-S1',
    reason:
      'PipelineStack contains only framework-generated pipeline constructs; no application resources in this stack. ' +
      'Artifact bucket is CDK Pipelines internal storage with cross-account KMS; access logging adds cost without security value on transient build artifacts.',
  },
]);

app.synth();
