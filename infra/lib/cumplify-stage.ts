/**
 * CumplifyStage — per-environment stage containing all stacks.
 * Stack ordering: Network → Security → Data → Identity (via addDependency).
 * Per design §1.3 (F-8 resolution).
 */

import * as cdk from 'aws-cdk-lib';
import { Aspects } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { Construct } from 'constructs';
import { type EnvConfig, DR_REGION, MGMT_ACCOUNT } from './env-config.js';
import { NetworkStack } from './network-stack.js';
import { SecurityStack } from './security-stack.js';
import { DataStack } from './data-stack.js';
import { IdentityStack } from './identity-stack.js';
import { DrRegionStack } from './dr-region-stack.js';
import { EventingStack } from './eventing-stack.js';
import { AuditTrailStack } from './audit-trail-stack.js';
import { ApiStack } from './api-stack.js';

export interface CumplifyStageProps extends cdk.StageProps {
  readonly envConfig: EnvConfig;
}

export class CumplifyStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: CumplifyStageProps) {
    super(scope, id, props);

    const { envConfig } = props;

    // GUARDRAIL: a workload stage must never target the management account.
    // mgmt hosts ONLY the pipeline; SCPs can't restrict mgmt, so this synth-time
    // check is the enforced control. Owner policy 2026-07-04. See env-config.ts
    // assertWorkloadAccountBoundary() + 06-cdk-conventions.md.
    if (envConfig.account === MGMT_ACCOUNT) {
      throw new Error(
        `CumplifyStage '${id}' resolves to the management account ${MGMT_ACCOUNT}. ` +
          `Application stacks must never deploy to mgmt — use dev/staging/prod.`,
      );
    }

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

    // EventingStack — no cross-stack deps from spec-1 stacks; deploys independently.
    const eventingStack = new EventingStack(this, 'EventingStack', { envConfig });

    // AuditTrailStack — cross-stack deps: DataStack, SecurityStack, EventingStack.
    const auditTrailStack = new AuditTrailStack(this, 'AuditTrailStack', {
      envConfig,
      tableArn: dataStack.tableArn,
      tableName: dataStack.tableName,
      tableStreamArn: dataStack.tableStreamArn,
      dynamodbKey: securityStack.outputs.dynamodbKey,
      s3GeneralKey: securityStack.outputs.s3GeneralKey,
      auditSinkQueueArn: eventingStack.auditSinkQueueArn,
      auditSinkDlqUrl: eventingStack.auditSinkDlqUrl,
      auditSinkDlqArn: eventingStack.auditSinkDlqArn,
    });
    auditTrailStack.addDependency(dataStack);
    auditTrailStack.addDependency(securityStack);
    auditTrailStack.addDependency(eventingStack);

    // ApiStack — AppSync GraphQL API for M1–M5 (spec 3: api-core)
    const apiStack = new ApiStack(this, 'ApiStack', {
      envConfig,
      tableArn: dataStack.tableArn,
      tableName: dataStack.tableName,
      dynamodbKey: securityStack.outputs.dynamodbKey,
      dbSecretKey: securityStack.outputs.secretsKey,
      clusterArn: dataStack.clusterArn,
      clusterEndpoint: dataStack.clusterEndpoint,
      dbSecretArn: dataStack.dbSecretArn,
      poolBId: identityStack.poolBId,
      poolBArn: identityStack.poolBArn,
      poolCId: identityStack.poolCId,
      poolCArn: identityStack.poolCArn,
      poolBClientId: identityStack.poolBClientId,
      poolCClientId: identityStack.poolCClientId,
      regionalWafArn: securityStack.outputs.regionalWaf.attrArn,
      busName: eventingStack.busName,
      busArn: eventingStack.busArn,
    });
    apiStack.addDependency(dataStack);
    apiStack.addDependency(identityStack);
    apiStack.addDependency(securityStack);
    apiStack.addDependency(eventingStack);

    // AC-1.6: CDK Nag also applied at stage level.
    // Required because CDK Pipelines stages are separate cloud assemblies —
    // App-level Aspects do not propagate into stage assemblies (verified:
    // Nag reports are only generated for PipelineStack when Aspect is at app
    // level alone; stage stacks produce no findings/reports without this).
    Aspects.of(this).add(new AwsSolutionsChecks({ verbose: true }));
  }
}
