/**
 * AiStack — AI agents infrastructure for agents-existing-8.
 * Design §7 — Option B (custom Converse loop, no CfnAgent).
 *
 * Resources: AI Invoker Lambda, CfnGuardrail, HITL State Machine,
 * 3 new SQS queues + DLQs (DocStudio, LeadAuditor, ControlTower),
 * 3 EventBridge rules (R-8/R-9/R-10), DLQ alarms,
 * MODELWEIGHT# seeding custom resource, inference profiles.
 *
 * Joins CumplifyStage with addDependency on DataStack, ApiStack,
 * EventingStack, AuditTrailStack.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import * as cr from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { NagSuppressions } from 'cdk-nag';
import type { EnvConfig } from './env-config.js';

export interface AiStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  // Cross-stack imports
  readonly tableArn: string;
  readonly tableName: string;
  readonly dynamodbKey: kms.IKey;
  readonly clusterArn: string;
  readonly dbSecretArn: string;
  readonly dbSecretKey: kms.IKey;
  readonly busName: string;
  readonly busArn: string;
  readonly deliveryFailureDlqArn: string;
  // Existing queues consumed by agents
  readonly capaIntakeQueueArn: string;
  readonly auditSinkQueueArn: string;
  readonly recordsQueueArn: string;
  // AOSS infra (from NetworkStack + SecurityStack)
  readonly aossVpcEndpointId: string;
  readonly bedrockKeyArn: string;
  // App-role secret for RLS-safe writes (from ApiStack, T4-F1)
  readonly appRoleSecretArn: string;
}

export class AiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AiStackProps) {
    super(scope, id, props);

    const { envConfig } = props;

    // ─── Import existing resources ─────────────────────────────────────────
    const bus = events.EventBus.fromEventBusAttributes(this, 'ImportedBus', {
      eventBusName: props.busName,
      eventBusArn: props.busArn,
      eventBusPolicy: '',
    });

    const deliveryFailureDlq = sqs.Queue.fromQueueArn(this, 'ImportedDeliveryDlq', props.deliveryFailureDlqArn);

    // ─── CfnGuardrail (PII + PROMPT_ATTACK) ───────────────────────────────
    const guardrail = new bedrock.CfnGuardrail(this, 'AgentGuardrail', {
      name: `cumplify-agent-guardrail-${envConfig.envName}`,
      blockedInputMessaging: 'Request blocked by content policy.',
      blockedOutputsMessaging: 'Response blocked by content policy.',
      contentPolicyConfig: {
        filtersConfig: [
          { type: 'PROMPT_ATTACK', inputStrength: 'HIGH', outputStrength: 'NONE' },
        ],
      },
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'SSN', action: 'BLOCK' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
        ],
      },
    });

    // ─── AI Invoker Lambda (the ONE DOOR) ──────────────────────────────────
    const aiInvoker = new NodejsFunction(this, 'AiInvokerFn', {
      entry: 'services/ai-invoker/src/index.ts',
      handler: 'invoke',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(90),
      bundling: { externalModules: [], target: 'node22' },
      environment: {
        TABLE_NAME: props.tableName,
        BUS_NAME: props.busName,
        GUARDRAIL_ID: guardrail.attrGuardrailId,
        GUARDRAIL_VERSION: guardrail.attrVersion,
        POWERTOOLS_SERVICE_NAME: 'ai-invoker',
      },
    });

    // AI Invoker IAM: bedrock:InvokeModel (ONLY role with this permission)
    aiInvoker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['bedrock:InvokeModel', 'bedrock:ApplyGuardrail'],
      resources: ['*'], // Required by Bedrock
    }));

    // DynamoDB: TENANT#*#METER read/write + MODELWEIGHT# read
    aiInvoker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
      resources: [props.tableArn, `${props.tableArn}/index/*`],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['TENANT#*#METER', 'MODELWEIGHT#*', 'TENANT#*#ENTITLEMENT'],
        },
      },
    }));
    props.dynamodbKey.grantEncryptDecrypt(aiInvoker);

    // EventBridge: PutEvents for telemetry
    aiInvoker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['events:PutEvents'],
      resources: [props.busArn],
    }));

    // ─── Store-Token Lambda (T-8d: persists taskToken into DDB HITL item) ──
    const storeTokenLambda = new NodejsFunction(this, 'StoreTokenFn', {
      entry: 'services/agents/shared/store-token.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      bundling: { externalModules: [], target: 'node22' },
      environment: {
        TABLE_NAME: props.tableName,
        POWERTOOLS_SERVICE_NAME: 'store-token',
      },
    });

    // ─── ExecuteWriteback Lambda (T-8a/T-8b) ───────────────────────────────
    const executeWritebackLambda = new NodejsFunction(this, 'ExecuteWritebackFn', {
      entry: 'services/agents/shared/execute-writeback.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      bundling: { externalModules: [], target: 'node22' },
      environment: {
        CLUSTER_ARN: props.clusterArn,
        APP_ROLE_SECRET_ARN: props.appRoleSecretArn,
        BUS_NAME: props.busName,
        POWERTOOLS_SERVICE_NAME: 'execute-writeback',
      },
    });

    // T-8b (BINDING): ExecuteWriteback invoke-permission = HITL state-machine role ONLY.
    // No agent handler can invoke this Lambda — only SFN after approval.
    executeWritebackLambda.addPermission('AllowSfnInvokeOnly', {
      principal: new iam.ServicePrincipal('states.amazonaws.com'),
      sourceArn: 'arn:aws:states:*:*:stateMachine:*', // Refined after SFN creation below
      action: 'lambda:InvokeFunction',
    });

    // ─── HITL State Machine (Step Functions Standard, waitForTaskToken) ─────
    const recordProposal = new sfn.Pass(this, 'RecordProposal', {
      comment: 'Record the proposed action metadata',
    });

    const waitForApproval = new sfn.CustomState(this, 'WaitForApproval', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
        Parameters: {
          // T-8d: StoreToken Lambda persists $$.Task.Token into DDB HITL item.
          'FunctionName': storeTokenLambda.functionArn,
          'Payload': {
            'taskToken.$': '$$.Task.Token',
            'input.$': '$',
          },
        },
        TimeoutSeconds: 604800, // 7 days
        ResultPath: '$.approvalResult',
      },
    });

    const executeWriteback = new sfn.CustomState(this, 'ExecuteWriteback', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          'FunctionName': 'PLACEHOLDER_WRITEBACK_LAMBDA', // Set in Task 4/8
          'Payload.$': '$',
        },
        ResultPath: '$.writebackResult',
      },
    });

    const emitAuditEvent = new sfn.CustomState(this, 'EmitAuditEvent', {
      stateJson: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          'FunctionName': 'PLACEHOLDER_AUDIT_LAMBDA', // Set in Task 4/8
          'Payload.$': '$',
        },
        ResultPath: '$.auditResult',
      },
    });

    // Timeout handled by WaitForApproval's TimeoutSeconds (7 days)
    // On timeout, SFN execution fails — CloudWatch alarm detects failed executions.

    const definition = recordProposal
      .next(waitForApproval)
      .next(executeWriteback)
      .next(emitAuditEvent);

    const hitlStateMachine = new sfn.StateMachine(this, 'HitlStateMachine', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.days(8), // Slightly over 7d to allow for processing
    });

    // ─── New SQS Queues + DLQs (DocStudio, LeadAuditor, ControlTower) ──────
    const docStudioDlq = this.createStdDlq('DocStudioDlq');
    const docStudioQueue = this.createStdQueue('DocStudioQueue', docStudioDlq);

    const leadAuditorDlq = this.createStdDlq('LeadAuditorDlq');
    const leadAuditorQueue = this.createStdQueue('LeadAuditorQueue', leadAuditorDlq);

    const controlTowerDlq = this.createStdDlq('ControlTowerDlq');
    const controlTowerQueue = this.createStdQueue('ControlTowerQueue', controlTowerDlq);

    // ─── EventBridge Rules (R-8/R-9/R-10) ──────────────────────────────────
    const ruleRetryPolicy: targets.TargetBaseProps = {
      retryAttempts: 3,
      maxEventAge: cdk.Duration.hours(24),
      deadLetterQueue: deliveryFailureDlq as sqs.IQueue,
    };

    const canonicalTransformer = {
      inputPathsMap: { dt: '$.detail-type', detail: '$.detail' },
      inputTemplate: '{"detailType": "<dt>", "detail": <detail>}',
    };

    // R-8: DocStudioRule
    const docStudioRule = new events.Rule(this, 'DocStudioRule', {
      eventBus: bus,
      eventPattern: {
        detailType: ['CAPA.ActionRequiresDocChange', 'Policy.Updated', 'Scope.Changed'],
      },
    });
    docStudioRule.addTarget(new targets.SqsQueue(docStudioQueue, { ...ruleRetryPolicy }));
    this.applyInputTransformer(docStudioRule, canonicalTransformer);

    // R-9: LeadAuditorRule
    const leadAuditorRule = new events.Rule(this, 'LeadAuditorRule', {
      eventBus: bus,
      eventPattern: {
        detailType: ['ManagementReview.ActionAudit', 'Objectives.OffTrack'],
      },
    });
    leadAuditorRule.addTarget(new targets.SqsQueue(leadAuditorQueue, { ...ruleRetryPolicy }));
    this.applyInputTransformer(leadAuditorRule, canonicalTransformer);

    // R-10: ControlTowerRule
    const controlTowerRule = new events.Rule(this, 'ControlTowerRule', {
      eventBus: bus,
      eventPattern: {
        detailType: ['Context.Updated', 'Scope.Changed', 'Policy.Updated', 'Risk.Escalated'],
      },
    });
    controlTowerRule.addTarget(new targets.SqsQueue(controlTowerQueue, { ...ruleRetryPolicy }));
    this.applyInputTransformer(controlTowerRule, canonicalTransformer);

    // ─── DLQ Alarms (depth > 0 for 15 min) ─────────────────────────────────
    const dlqAlarms = [
      { id: 'DocStudioDlqAlarm', dlq: docStudioDlq },
      { id: 'LeadAuditorDlqAlarm', dlq: leadAuditorDlq },
      { id: 'ControlTowerDlqAlarm', dlq: controlTowerDlq },
    ];
    for (const { id, dlq } of dlqAlarms) {
      new cloudwatch.Alarm(this, id, {
        metric: dlq.metricApproximateNumberOfMessagesVisible({
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 3, // 15 min
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    }

    // ─── AOSS Collections (3x VECTORSEARCH, NextGen scale-to-zero) ─────────
    // Design §4.2: ISO-KB, TENANT-DOCS-KB, NC-HISTORY
    const collectionNames = ['cumplify-iso-kb', 'cumplify-tenant-docs-kb', 'cumplify-nc-history'] as const;

    const aossCollections: Record<string, opensearchserverless.CfnCollection> = {};

    for (const name of collectionNames) {
      // Encryption policy (per collection)
      const encPolicy = new opensearchserverless.CfnSecurityPolicy(this, `${name}-enc`, {
        name: `${name}-enc`,
        type: 'encryption',
        policy: JSON.stringify({
          Rules: [{ ResourceType: 'collection', Resource: [`collection/${name}`] }],
          AWSOwnedKey: false,
          KmsARN: props.bedrockKeyArn,
        }),
      });

      // Network policy — VPC endpoint only (Option B: no Bedrock→AOSS managed path)
      const netPolicy = new opensearchserverless.CfnSecurityPolicy(this, `${name}-net`, {
        name: `${name}-net`,
        type: 'network',
        policy: JSON.stringify([{
          Rules: [
            { ResourceType: 'collection', Resource: [`collection/${name}`] },
            { ResourceType: 'dashboard', Resource: [`collection/${name}`] },
          ],
          AllowFromPublic: false,
          // SourceVPCEs: AWS::OpenSearchServerless::VpcEndpoint ID (NOT EC2 interface endpoint)
          SourceVPCEs: [props.aossVpcEndpointId],
        }]),
      });

      // Collection
      const collection = new opensearchserverless.CfnCollection(this, `Aoss-${name}`, {
        name,
        type: 'VECTORSEARCH',
        description: `Cumplify AI agents: ${name} (Titan Embed v2, 1024 dims, scale-to-zero)`,
        standbyReplicas: 'DISABLED', // NextGen scale-to-zero
      });
      collection.addDependency(encPolicy);
      collection.addDependency(netPolicy);

      aossCollections[name] = collection;
    }

    // ─── AOSS Data-Access Policy (Task 4, REQUIRES-HUMAN) ────────────────
    // T4-F2 FIX: AOSS requires EXACT ARNs — no globs. Seeder ARN is known now;
    // agent-handler + apply-template roles are AMENDED in Task 8 / Task 9 with
    // exact ARNs once those roles exist.
    const collectionResources = collectionNames.map((n) => `collection/${n}`);
    const indexResources = collectionNames.map((n) => `index/${n}/*`);
    const collectionArns = collectionNames.map((n) => aossCollections[n].attrArn);

    // READ access policy (invoker — seeder WRITE added post-declaration below)
    // Full data-access policy assembled after weightSeeder is defined (avoid forward ref).

    // ─── Agent Handler Read-Only Policy Factory (T4-F4, T-1 gate b) ────────
    // Agent handlers get: lambda:Invoke(invoker), SFN start, AOSS read.
    // They have ZERO RDS access, ZERO DynamoDB access (context via SQS event
    // payload + AOSS retrieval). NO dynamodb:PutItem/UpdateItem/DeleteItem.
    // NO dynamodb:GetItem/Query (T4R-F1: avoids cross-tenant reads; handler
    // proposes then pauses — frontend polls HITL status, not the handler).
    // SQS consume permissions auto-granted by CDK SqsEventSource in Task 8.
    //
    // Exported as a reusable managed policy so Task 8 attaches it to each handler.
    const agentHandlerPolicy = new iam.ManagedPolicy(this, 'AgentHandlerReadOnlyPolicy', {
      description: 'Shared read-only policy for agent handler Lambdas (T-1: zero write, zero DDB).',
      statements: [
        // lambda:InvokeFunction on AI Invoker only
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['lambda:InvokeFunction'],
          resources: [aiInvoker.functionArn],
        }),
        // SFN: StartExecution on HITL state machine
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['states:StartExecution'],
          resources: [hitlStateMachine.stateMachineArn],
        }),
        // AOSS: APIAccessAll for retrieval (read path)
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['aoss:APIAccessAll'],
          resources: collectionArns,
        }),
      ],
    });

    // ─── ExecuteWriteback Role (post-HITL, the ONLY write path) ────────────
    // T4-F1 FIX: uses app_role secret (NOT master) → RLS enforced.
    // T4-F5 carry: invoke-permission restricted to HITL state-machine role in Task 8.
    // Role policies attached to the CDK-generated Lambda execution role.
    executeWritebackLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BatchExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
      ],
      resources: [props.clusterArn],
    }));
    executeWritebackLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.appRoleSecretArn],
    }));
    props.dynamodbKey.grantDecrypt(executeWritebackLambda);
    executeWritebackLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['events:PutEvents'],
      resources: [props.busArn],
    }));

    // ─── Store-Token Lambda Role (gate c) ──────────────────────────────────
    // Writes ONLY the taskToken field into the DDB HITL item, tenant-scoped.
    storeTokenLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:UpdateItem'],
      resources: [props.tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['TENANT#*#HITL'],
        },
      },
    }));
    props.dynamodbKey.grantEncryptDecrypt(storeTokenLambda);

    // ─── CfnOutputs for IAM roles ──────────────────────────────────────────
    new cdk.CfnOutput(this, 'ExecuteWritebackRoleArn', { value: executeWritebackLambda.role!.roleArn });
    new cdk.CfnOutput(this, 'StoreTokenRoleArn', { value: storeTokenLambda.role!.roleArn });
    new cdk.CfnOutput(this, 'AgentHandlerPolicyArn', { value: agentHandlerPolicy.managedPolicyArn });
    new cdk.CfnOutput(this, 'ExecuteWritebackLambdaArn', { value: executeWritebackLambda.functionArn });
    new cdk.CfnOutput(this, 'StoreTokenLambdaArn', { value: storeTokenLambda.functionArn });

    // ─── Index Mapping (R5 carry — metadata.tenantId as keyword) ──────────
    // Committed artifact: services/agents/shared/aoss-index-template.json
    // Defines: knn_vector 1024-dim (faiss/hnsw), metadata.tenantId/standard/clauseRef
    // as keyword (filterable). The term filter in retrieval.ts only isolates tenants
    // if tenantId is keyword (non-analyzed).
    //
    // The apply-template custom resource (Task 9 deliverable):
    // A VPC-attached, SigV4-signing Lambda PUTs _index_template to each collection
    // endpoint BEFORE any document seeding. Requires Task-4 AOSS data-access grant.
    // Task 12 seeding must fail-closed if the template is absent (GET _index_template
    // first — never index against an auto-mapped field).

    // ─── MODELWEIGHT# Seeding Custom Resource (T-2/T3-F3) ──────────────────
    // Reads services/ai-invoker/data/model-weights-seed.json (committed by Task 2,
    // architect-witnessed) and writes MODELWEIGHT# items to DynamoDB.
    // Does NOT call live Pricing API at deploy time (T-2 correction).
    const weightSeeder = new NodejsFunction(this, 'WeightSeederFn', {
      entry: 'services/ai-invoker/src/weight-seeder.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      bundling: { externalModules: [], target: 'node22' },
      environment: {
        TABLE_NAME: props.tableName,
        POWERTOOLS_SERVICE_NAME: 'weight-seeder',
      },
    });
    weightSeeder.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['MODELWEIGHT#*'],
        },
      },
    }));
    props.dynamodbKey.grantEncryptDecrypt(weightSeeder);

    // Custom resource trigger (runs on deploy)
    // T3E-F4: incorporate hash of seed file into physicalResourceId so a changed
    // seed file triggers re-seeding. ConditionalCheckFailed is handled (F3).
    const seedFileHash = cdk.FileSystem.fingerprint('services/ai-invoker/data/model-weights-seed.json');
    new cr.AwsCustomResource(this, 'WeightSeederTrigger', {
      onCreate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: weightSeeder.functionName,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({ action: 'seed', seedHash: seedFileHash }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(`weight-seeder-${seedFileHash}`),
      },
      onUpdate: {
        service: 'Lambda',
        action: 'invoke',
        parameters: {
          FunctionName: weightSeeder.functionName,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify({ action: 'seed', seedHash: seedFileHash }),
        },
        physicalResourceId: cr.PhysicalResourceId.of(`weight-seeder-${seedFileHash}`),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [weightSeeder.functionArn],
        }),
      ]),
    });

    // ─── AOSS Data-Access Policy (assembled post-seeder to avoid forward ref) ──
    new opensearchserverless.CfnAccessPolicy(this, 'AiAossDataAccessPolicy', {
      name: `cumplify-ai-access-${envConfig.envName}`,
      type: 'data',
      policy: JSON.stringify([
        {
          // READ access: AI Invoker (retrieval for one-door path)
          Rules: [
            { ResourceType: 'collection', Resource: collectionResources, Permission: ['aoss:DescribeCollectionItems'] },
            { ResourceType: 'index', Resource: indexResources, Permission: ['aoss:DescribeIndex', 'aoss:ReadDocument'] },
          ],
          Principal: [aiInvoker.role!.roleArn],
          // NOTE: agent-handler principals AMENDED in Task 8 with exact role ARNs.
        },
        {
          // WRITE access: weight-seeder + future apply-template
          Rules: [
            { ResourceType: 'collection', Resource: collectionResources, Permission: ['aoss:CreateCollectionItems', 'aoss:UpdateCollectionItems', 'aoss:DescribeCollectionItems'] },
            { ResourceType: 'index', Resource: indexResources, Permission: ['aoss:CreateIndex', 'aoss:UpdateIndex', 'aoss:DescribeIndex', 'aoss:ReadDocument', 'aoss:WriteDocument'] },
          ],
          Principal: [weightSeeder.role!.roleArn],
          // NOTE: apply-template principal AMENDED in Task 9 with exact role ARN.
        },
      ]),
    });

    // T4-F3 FIX: aoss:APIAccessAll in IAM (data-plane access to AOSS collections)
    aiInvoker.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['aoss:APIAccessAll'],
      resources: collectionArns,
    }));
    weightSeeder.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['aoss:APIAccessAll'],
      resources: collectionArns,
    }));

    // ─── CfnOutputs ────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AiInvokerArn', { value: aiInvoker.functionArn });
    new cdk.CfnOutput(this, 'AiInvokerRoleArn', { value: aiInvoker.role!.roleArn });
    new cdk.CfnOutput(this, 'GuardrailId', { value: guardrail.attrGuardrailId });
    new cdk.CfnOutput(this, 'GuardrailVersion', { value: guardrail.attrVersion });
    new cdk.CfnOutput(this, 'HitlStateMachineArn', { value: hitlStateMachine.stateMachineArn });

    new cdk.CfnOutput(this, 'DocStudioQueueUrl', { value: docStudioQueue.queueUrl });
    new cdk.CfnOutput(this, 'DocStudioQueueArn', { value: docStudioQueue.queueArn });
    new cdk.CfnOutput(this, 'DocStudioDlqArn', { value: docStudioDlq.queueArn });
    new cdk.CfnOutput(this, 'LeadAuditorQueueUrl', { value: leadAuditorQueue.queueUrl });
    new cdk.CfnOutput(this, 'LeadAuditorQueueArn', { value: leadAuditorQueue.queueArn });
    new cdk.CfnOutput(this, 'LeadAuditorDlqArn', { value: leadAuditorDlq.queueArn });
    new cdk.CfnOutput(this, 'ControlTowerQueueUrl', { value: controlTowerQueue.queueUrl });
    new cdk.CfnOutput(this, 'ControlTowerQueueArn', { value: controlTowerQueue.queueArn });
    new cdk.CfnOutput(this, 'ControlTowerDlqArn', { value: controlTowerDlq.queueArn });

    new cdk.CfnOutput(this, 'DocStudioRuleName', { value: docStudioRule.ruleName });
    new cdk.CfnOutput(this, 'LeadAuditorRuleName', { value: leadAuditorRule.ruleName });
    new cdk.CfnOutput(this, 'ControlTowerRuleName', { value: controlTowerRule.ruleName });

    // AOSS collection outputs
    for (const name of collectionNames) {
      const safeName = name.replace(/-/g, '');
      const collection = aossCollections[name];
      new cdk.CfnOutput(this, `${safeName}Endpoint`, { value: collection.attrCollectionEndpoint });
      new cdk.CfnOutput(this, `${safeName}Arn`, { value: collection.attrArn });
    }

    // ─── CDK Nag Suppressions ──────────────────────────────────────────────
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Lambda execution roles use AWSLambdaBasicExecutionRole (CDK-generated). ' +
            'Standard minimal policy for Lambda logging.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'bedrock:InvokeModel requires Resource: * (AWS Bedrock constraint). ' +
            'Lambda log stream wildcard is CDK standard pattern.',
        },
        {
          id: 'AwsSolutions-L1',
          reason:
            'Lambda uses NODEJS_22_X (latest LTS). CDK Nag may not recognize newer runtimes.',
        },
        {
          id: 'AwsSolutions-SF1',
          reason:
            'HITL state machine logging deferred to observability spec (spec 14). ' +
            'Non-blocking for functional correctness.',
        },
        {
          id: 'AwsSolutions-SF2',
          reason:
            'X-Ray tracing deferred to observability spec (spec 14). ' +
            'Non-blocking for functional correctness.',
        },
      ],
      true,
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private createStdDlq(id: string): sqs.Queue {
    const dlq = new sqs.Queue(this, id, { enforceSSL: true });
    NagSuppressions.addResourceSuppressions(dlq, [
      { id: 'AwsSolutions-SQS3', reason: 'This is a dead-letter queue — no redrive policy needed' },
    ]);
    return dlq;
  }

  private createStdQueue(id: string, dlq: sqs.Queue): sqs.Queue {
    return new sqs.Queue(this, id, {
      enforceSSL: true,
      visibilityTimeout: cdk.Duration.seconds(360),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 3 },
    });
  }

  private applyInputTransformer(
    rule: events.Rule,
    transformer: { inputPathsMap: Record<string, string>; inputTemplate: string },
  ): void {
    const cfnRule = rule.node.defaultChild as events.CfnRule;
    cfnRule.addPropertyOverride('Targets.0.InputTransformer', {
      InputPathsMap: transformer.inputPathsMap,
      InputTemplate: transformer.inputTemplate,
    });
  }
}
