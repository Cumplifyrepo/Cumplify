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

// AC-1.6: CDK Nag — all warnings = failures (Cumplify rule)
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// PipelineStack lives in the management account (AC-1.1)
new PipelineStack(app, 'CumplifyPipeline', {
  env: { account: MGMT_ACCOUNT, region: PRIMARY_REGION },
});

app.synth();
