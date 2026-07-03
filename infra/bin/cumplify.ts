#!/usr/bin/env node
/**
 * CDK app entrypoint — synthesizes PipelineStack (mgmt) + CumplifyStage per env.
 * Per AC-1.1, design §1.1.
 */

import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { PipelineStack } from '../lib/pipeline-stack.js';
import { MGMT_ACCOUNT, PRIMARY_REGION } from '../lib/env-config.js';

const app = new cdk.App();

// PipelineStack lives in the management account (AC-1.1)
const pipelineStack = new PipelineStack(app, 'CumplifyPipeline', {
  env: { account: MGMT_ACCOUNT, region: PRIMARY_REGION },
});

// AC-1.6: CDK Nag — all warnings = failures (Cumplify rule).
// Applied at the App level so EVERY stack (pipeline + application) is audited.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));

// --- Cross-region support stack suppressions ---
// CDK Pipelines creates cross-region support stacks (replication buckets) when
// stages contain stacks in different regions. These are framework-generated and
// cannot be customized. Suppress Nag findings on all cross-region support stacks.
for (const child of app.node.children) {
  if (child instanceof cdk.Stack && child.node.id.startsWith('cross-region-stack-')) {
    NagSuppressions.addStackSuppressions(child, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Cross-region replication bucket is CDK Pipelines framework infrastructure ' +
          'for cross-region artifact delivery. Cannot add logging without forking internals.',
      },
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'Cross-region support stack IAM roles are CDK Pipelines framework-generated ' +
          'for artifact replication. Cannot scope further.',
      },
    ]);
  }
}

// --- PipelineStack IAM5/S1 suppressions ---
// CDK Pipelines generates IAM roles with inherent Resource:'*' wildcards for
// cross-account artifact access, KMS key grants, CodeBuild log groups, and
// report groups. These are framework-generated patterns that cannot be scoped
// further without breaking CDK Pipelines self-mutation and cross-account
// deploy mechanics. Audited via CloudTrail + REQUIRES-HUMAN security review.
NagSuppressions.addStackSuppressions(pipelineStack, [
  {
    id: 'AwsSolutions-IAM5',
    reason:
      'PipelineStack contains only framework-generated pipeline constructs; no application resources in this stack.',
    appliesTo: [
      // CodeBuild log-group wildcards (Synth, SmokeTest, LegalSignoffGuard, SelfMutation)
      { regex: '/^Resource::arn:<AWS::Partition>:logs:.+:log-group:.+codebuild.+$/' },
      // CodeBuild report-group wildcards
      { regex: '/^Resource::arn:<AWS::Partition>:codebuild:.+:report-group.+$/' },
      // SelfMutation needs iam:PassRole on any role for CloudFormation execution
      { regex: '/^Resource::arn:\\*:iam::.+:role.+$/' },
      // SelfMutation/Synth needs broad S3 + KMS for cross-account artifact bucket
      'Resource::*',
      // Artifact bucket object-level wildcard
      { regex: '/^Resource::<.+ArtifactsBucket.+\\.Arn>.+$/' },
      // Cross-region replication bucket object-level wildcard (prod DR us-west-2)
      { regex: '/^Resource::arn:<AWS::Partition>:s3:::.+eplicationbucket.+$/' },
      // S3 action wildcards on artifact bucket
      'Action::s3:Abort*',
      'Action::s3:DeleteObject*',
      'Action::s3:GetBucket*',
      'Action::s3:GetObject*',
      'Action::s3:List*',
      // KMS action wildcards for cross-account key usage
      'Action::kms:GenerateDataKey*',
      'Action::kms:ReEncrypt*',
    ],
  },
  {
    id: 'AwsSolutions-S1',
    reason:
      'Artifact bucket and cross-region replication bucket are CDK Pipelines internal storage ' +
      'with cross-account KMS; access logging adds cost without security value on transient ' +
      'build artifacts.',
  },
]);

app.synth();
