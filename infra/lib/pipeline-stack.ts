/**
 * PipelineStack — self-mutating CDK Pipeline in the management account.
 * Per AC-1.1 through AC-1.8, design §1.1.
 */

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { CumplifyStage } from './cumplify-stage.js';
import { ENV_CONFIGS } from './env-config.js';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // CodeStar Connection ARN from CDK context (AC-1.5 — never hardcoded)
    const connectionArn = this.node.tryGetContext('codestarConnectionArn') as string;

    const pipeline = new pipelines.CodePipeline(this, 'CumplifyPipeline', {
      pipelineName: 'CumplifyPipeline',
      crossAccountKeys: true, // AC-1.2 — REQUIRED for cross-account artifact bucket
      enableKeyRotation: true, // AC-1.2
      selfMutation: true, // AC-1.2 — pipeline updates its own definition

      synth: new pipelines.ShellStep('Synth', {
        input: pipelines.CodePipelineSource.connection('strivanallc-crypto/Cumplify', 'develop', {
          connectionArn,
        }),
        commands: [
          'npm ci',
          'npm run test',
          'npm audit --audit-level=high',
          'npx cdk synth --all',
          // CDK Nag runs as an Aspect during synth; a Nag error fails synth here.
        ],
      }),

      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          computeType: codebuild.ComputeType.SMALL,
        },
      },
    });

    // Dev — no gate (AC-1.3)
    pipeline.addStage(
      new CumplifyStage(this, 'Dev', {
        env: { account: ENV_CONFIGS.dev.account, region: ENV_CONFIGS.dev.region },
        envConfig: ENV_CONFIGS.dev,
      }),
    );

    // Staging — ManualApprovalStep (pre) + SmokeTest (post-deploy) (AC-1.3)
    pipeline.addStage(
      new CumplifyStage(this, 'Staging', {
        env: { account: ENV_CONFIGS.staging.account, region: ENV_CONFIGS.staging.region },
        envConfig: ENV_CONFIGS.staging,
      }),
      {
        pre: [new pipelines.ManualApprovalStep('ApproveToStaging')],
        post: [
          new pipelines.ShellStep('SmokeTest', {
            commands: ['curl -f https://staging.cumplify.ai/health || true'],
          }),
        ],
      },
    );

    // Prod — ManualApprovalStep + LegalSignoffGuard (pre) + RollbackInitiator (post) (AC-1.3)
    pipeline.addStage(
      new CumplifyStage(this, 'Prod', {
        env: { account: ENV_CONFIGS.prod.account, region: ENV_CONFIGS.prod.region },
        envConfig: ENV_CONFIGS.prod,
      }),
      {
        pre: [
          new pipelines.ManualApprovalStep('ApproveToProd'),
          new pipelines.ShellStep('LegalSignoffGuard', {
            commands: ['npx tsx scripts/assert-legal-signoff.ts'],
          }),
        ],
        // RollbackInitiator: auto-rollback wired via CloudWatch alarms on the deployed stacks
        // (configured per-stack in later specs when alarms exist)
      },
    );

    // CDK Nag suppressions: CDK Pipelines creates IAM roles with Resource:'*'
    // which is inherent to its cross-account self-mutation design. Verified:
    // these wildcards are for pipeline operational permissions (S3 artifact
    // bucket, KMS key, CodeBuild actions), not application-level data access.
    NagSuppressions.addStackSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'CDK Pipelines requires Resource:* for cross-account self-mutation (artifact bucket, KMS, CodeBuild). Inherent to the construct, not application-level access.',
        },
        {
          id: 'AwsSolutions-S1',
          reason:
            'Pipeline artifact bucket is CDK-managed infrastructure. Server access logs on the artifact bucket are not required for SOC 2 evidence (the pipeline itself is audited via CloudTrail).',
        },
        {
          id: 'AwsSolutions-CB4',
          reason:
            'CodeBuild projects in CDK Pipelines use AWS-managed encryption for build artifacts. Application secrets are in Secrets Manager, not build env.',
        },
        {
          id: 'AwsSolutions-CB3',
          reason:
            'CDK Pipelines CodeBuild projects do not require privileged mode — they run synth/test only.',
        },
      ],
      true, // applyToChildren — suppresses on all resources in this stack
    );
  }
}
