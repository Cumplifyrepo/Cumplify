/**
 * CumplifyStage — per-environment stage containing all stacks.
 * Stack ordering: Network → Security → Data → Identity (via addDependency).
 * Per design §1.3 (F-8 resolution).
 */

import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Construct } from 'constructs';
import { type EnvConfig, DR_REGION } from './env-config.js';
import { NetworkStack } from './network-stack.js';
import { SecurityStack } from './security-stack.js';
import { DataStack } from './data-stack.js';
import { IdentityStack } from './identity-stack.js';
import { DrRegionStack } from './dr-region-stack.js';

export interface CumplifyStageProps extends cdk.StageProps {
  readonly envConfig: EnvConfig;
}

export class CumplifyStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: CumplifyStageProps) {
    super(scope, id, props);

    const { envConfig } = props;

    const networkStack = new NetworkStack(this, 'NetworkStack', { envConfig });

    const securityStack = new SecurityStack(this, 'SecurityStack', { envConfig });

    // DrRegionStack — prod-only, cross-region DR in us-west-2 (AC-1.8)
    // Must be created before DataStack to provide replica key + CRR destination ARNs.
    let drRegionStack: DrRegionStack | undefined;
    if (envConfig.drRegionStack) {
      drRegionStack = new DrRegionStack(this, 'DrRegionStack', {
        envConfig,
        primaryDynamodbKeyArn: securityStack.outputs.dynamodbKey.keyArn,
        env: { account: envConfig.account, region: DR_REGION },
      });
      drRegionStack.addDependency(securityStack);
    }

    const dataStack = new DataStack(this, 'DataStack', {
      envConfig,
      vpc: networkStack.vpc,
      aossVpcEndpointId: networkStack.aossVpcEndpointId,
      securityOutputs: securityStack.outputs,
      ...(drRegionStack
        ? {
            drReplicaKeyArn: drRegionStack.replicaKeyArn,
            crrDestinationBucketArn: drRegionStack.crrDestinationBucketArn,
          }
        : {}),
    });
    dataStack.addDependency(networkStack);
    dataStack.addDependency(securityStack);
    if (drRegionStack) {
      dataStack.addDependency(drRegionStack);
    }

    const identityStack = new IdentityStack(this, 'IdentityStack', {
      envConfig,
      tableName: dataStack.tableName,
    });
    identityStack.addDependency(dataStack);

    // AC-1.6: CDK Nag also applied at stage level.
    // Required because CDK Pipelines stages are separate cloud assemblies —
    // App-level Aspects do not propagate into stage assemblies (verified:
    // Nag reports are only generated for PipelineStack when Aspect is at app
    // level alone; stage stacks produce no findings/reports without this).
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));
  }
}
