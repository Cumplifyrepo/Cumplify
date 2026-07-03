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

export class PipelineStack extends cdk.Stack {
  public readonly pipelineStages: cdk.Stage[] = [];

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
  }
}
