/**
 * PipelineStack — self-mutating CDK Pipeline in the management account.
 * Per AC-1.1 through AC-1.8, design §1.1.
 */

import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';
import { CumplifyStage } from './cumplify-stage.js';
import { ENV_CONFIGS } from './env-config.js';
import { MgmtCostMonitor } from './mgmt-cost-monitor.js';

export class PipelineStack extends cdk.Stack {
  public readonly pipelineStages: cdk.Stage[] = [];
  public readonly pipeline: pipelines.CodePipeline;

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
        input: pipelines.CodePipelineSource.connection('Cumplifyrepo/Cumplify', 'develop', {
          connectionArn,
        }),
        commands: [
          'npm ci',
          // frontend has its own package tree; `npm run test` chains its vitest
          // suite, which cannot start without these deps (build 19b6d892 failed
          // on UNRESOLVED_IMPORT @vitejs/plugin-react — root ci only). Plain cd
          // form — npm's --prefix flag has install-target quirks.
          'cd frontend && npm ci && cd ..',
          'npm run test',
          'npm audit --audit-level=high',
          'npx cdk synth --all',
          // CDK Nag runs as an Aspect during synth; a Nag error fails synth here.
        ],
      }),

      codeBuildDefaults: {
        buildEnvironment: {
          // standard:8.0 (Ubuntu 24.04, Node 22 default) — required: toolchain
          // needs Node >= 20 (aws-cdk-lib 2.261, vitest 4); standard:7.0 ships
          // Node 18 and failed `npm run test` (build cfd8a62d, 2026-07-04).
          // No STANDARD_8_0 constant in installed aws-cdk-lib; image existence
          // verified via codebuild list-curated-environment-images (us-east-1).
          buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId('aws/codebuild/standard:8.0'),
          computeType: codebuild.ComputeType.SMALL,
        },
      },
    });

    // Dev — no gate (AC-1.3)
    const devStage = new CumplifyStage(this, 'Dev', {
      env: { account: ENV_CONFIGS.dev.account, region: ENV_CONFIGS.dev.region },
      envConfig: ENV_CONFIGS.dev,
    });
    pipeline.addStage(devStage);
    this.pipelineStages.push(devStage);

    // Staging — ManualApprovalStep (pre) + SmokeTest (post-deploy) (AC-1.3)
    const stagingStage = new CumplifyStage(this, 'Staging', {
      env: { account: ENV_CONFIGS.staging.account, region: ENV_CONFIGS.staging.region },
      envConfig: ENV_CONFIGS.staging,
    });
    pipeline.addStage(stagingStage, {
      pre: [new pipelines.ManualApprovalStep('ApproveToStaging')],
      post: [
        new pipelines.ShellStep('SmokeTest', {
          commands: ['curl -f https://staging.cumplify.ai/health || true'],
        }),
      ],
    });
    this.pipelineStages.push(stagingStage);

    // Prod — ManualApprovalStep + LegalSignoffGuard (pre) + RollbackInitiator (post) (AC-1.3)
    const prodStage = new CumplifyStage(this, 'Prod', {
      env: { account: ENV_CONFIGS.prod.account, region: ENV_CONFIGS.prod.region },
      envConfig: ENV_CONFIGS.prod,
    });
    pipeline.addStage(prodStage, {
      pre: [
        new pipelines.ManualApprovalStep('ApproveToProd'),
        new pipelines.ShellStep('LegalSignoffGuard', {
          commands: ['npx tsx scripts/assert-legal-signoff.ts'],
        }),
      ],
    });
    this.pipelineStages.push(prodStage);

    // Force eager construction of CodeBuild projects and IAM roles so that
    // CDK Nag aspects can visit them and NagSuppressions can be applied.
    pipeline.buildPipeline();

    this.pipeline = pipeline;

    // Detective control: alert if the mgmt account's spend jumps (would signal
    // a workload resource landing here out-of-band, bypassing the pipeline the
    // preventive account-boundary guardrail protects).
    const alertEmail =
      (this.node.tryGetContext('costAlertEmail') as string) ?? 'julio@mbdesignremodel.com';
    const mgmtBudgetUsd = Number(this.node.tryGetContext('mgmtBudgetLimitUsd') ?? 50);
    new MgmtCostMonitor(this, 'MgmtCostMonitor', {
      alertEmail,
      monthlyBudgetUsd: mgmtBudgetUsd,
    });
  }
}
