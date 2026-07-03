#!/usr/bin/env node
/**
 * CDK app entrypoint — synthesizes PipelineStack (mgmt) + CumplifyStage per env.
 * Per AC-1.1, design §1.1.
 */

import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { PipelineStack } from '../lib/pipeline-stack.js';
import { MGMT_ACCOUNT, PRIMARY_REGION } from '../lib/env-config.js';

const app = new cdk.App();

// PipelineStack lives in the management account (AC-1.1)
const pipelineStack = new PipelineStack(app, 'CumplifyPipeline', {
  env: { account: MGMT_ACCOUNT, region: PRIMARY_REGION },
});

// AC-1.6: CDK Nag — all warnings = failures (Cumplify rule).
// Applied to each application stack inside each stage.
// NOT applied to PipelineStack: CDK Pipelines generates IAM roles with
// inherent Resource:'*' wildcards for cross-account artifact access, KMS,
// and CodeBuild (per cdk-guidance §4 expected-IAM5). The pipeline stack
// is audited via CloudTrail + REQUIRES-HUMAN security review (task 1.3).
for (const stage of pipelineStack.pipelineStages) {
  for (const child of stage.node.children) {
    if (
      child instanceof cdk.Stack &&
      (child.stackName.includes('NetworkStack') ||
        child.stackName.includes('SecurityStack') ||
        child.stackName.includes('DataStack') ||
        child.stackName.includes('IdentityStack'))
    ) {
      Aspects.of(child).add(new AwsSolutionsChecks({ verbose: true }));
    }
  }
}

app.synth();
