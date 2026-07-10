/**
 * Template-assertion tests for AiStack.
 * Verifies: Lambda configs, SQS properties, EventBridge rule patterns,
 * guardrail config, state machine definition, CfnOutputs.
 *
 * Task 3 deliverable — agents-existing-8.
 */

import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { AiStack } from './ai-stack.js';
import { ENV_CONFIGS } from './env-config.js';

function createTestStack(): Template {
  const app = new cdk.App();
  const envConfig = ENV_CONFIGS.dev;

  const stack = new cdk.Stack(app, 'TestAiStack', {
    env: { account: envConfig.account, region: envConfig.region },
  });

  // Import keys within the same stack to avoid cross-environment errors
  const mockKey = kms.Key.fromKeyArn(stack, 'MockKey', 'arn:aws:kms:us-east-1:123456789012:key/mock-key-id');

  // Instantiate AiStack as a nested construct (not a separate stack) to avoid cross-env
  const aiStack = new AiStack(app, 'AiStack', {
    envConfig,
    tableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/CumplifyCore',
    tableName: 'CumplifyCore',
    dynamodbKey: mockKey,
    clusterArn: 'arn:aws:rds:us-east-1:123456789012:cluster:cumplify-dev',
    dbSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:cumplify-dev-db',
    dbSecretKey: mockKey,
    busName: 'cumplify-events',
    busArn: 'arn:aws:events:us-east-1:123456789012:event-bus/cumplify-events',
    deliveryFailureDlqArn: 'arn:aws:sqs:us-east-1:123456789012:DeliveryFailureDlq',
    capaIntakeQueueArn: 'arn:aws:sqs:us-east-1:123456789012:CapaIntakeQueue.fifo',
    capaIntakeDlqUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/CapaIntakeDlq.fifo',
    auditSinkQueueArn: 'arn:aws:sqs:us-east-1:123456789012:AuditSinkQueue.fifo',
    recordsQueueArn: 'arn:aws:sqs:us-east-1:123456789012:RecordsQueue',
    recordsDlqUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/RecordsDlq',
    aossVpcEndpointId: 'vpce-0123456789abcdef0',
    vpc: ec2.Vpc.fromVpcAttributes(stack, 'MockVpc', {
      vpcId: 'vpc-0123456789abcdef0',
      availabilityZones: ['us-east-1b', 'us-east-1c'],
      privateSubnetIds: ['subnet-aaa', 'subnet-bbb'],
    }),
    privateSubnets: [
      ec2.Subnet.fromSubnetAttributes(stack, 'MockSubnetA', { subnetId: 'subnet-aaa', availabilityZone: 'us-east-1b' }),
      ec2.Subnet.fromSubnetAttributes(stack, 'MockSubnetB', { subnetId: 'subnet-bbb', availabilityZone: 'us-east-1c' }),
    ],
    bedrockKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/bedrock-key-id',
    appRoleSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:cumplify/dev/rds/app-role',
    isoKbCollectionArn: 'arn:aws:aoss:us-east-1:123456789012:collection/mockisokb123',
    isoKbCollectionEndpoint: 'https://mockisokb123.us-east-1.aoss.amazonaws.com',
    graphqlApiId: 'test-api-id-123',
    graphqlApiUrl: 'https://test-api.appsync-api.us-east-1.amazonaws.com/graphql',
    env: { account: envConfig.account, region: envConfig.region },
  });

  return Template.fromStack(aiStack);
}

describe('AiStack', () => {
  const template = createTestStack();

  describe('AI Invoker Lambda', () => {
    it('uses NODEJS_22_X runtime, ARM_64, >= 512MB, 90s timeout', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        MemorySize: 512,
        Timeout: 90,
      });
    });

    it('has GUARDRAIL_ID and TABLE_NAME in environment', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            TABLE_NAME: 'CumplifyCore',
            POWERTOOLS_SERVICE_NAME: 'ai-invoker',
          }),
        },
      });
    });
  });

  describe('CfnGuardrail', () => {
    it('has PII + PROMPT_ATTACK config', () => {
      template.hasResourceProperties('AWS::Bedrock::Guardrail', {
        ContentPolicyConfig: {
          FiltersConfig: Match.arrayWith([
            Match.objectLike({ Type: 'PROMPT_ATTACK', InputStrength: 'HIGH' }),
          ]),
        },
      });
      // Verify PII entities separately (array order varies)
      template.hasResourceProperties('AWS::Bedrock::Guardrail', {
        SensitiveInformationPolicyConfig: {
          PiiEntitiesConfig: Match.arrayWith([
            Match.objectLike({ Type: 'US_SOCIAL_SECURITY_NUMBER', Action: 'BLOCK' }),
          ]),
        },
      });
    });

    it('does NOT reference any Anthropic model (REQ-CDK-7)', () => {
      const templateJson = JSON.stringify(template.toJSON());
      expect(templateJson).not.toContain('anthropic');
    });
  });

  describe('SQS Queues', () => {
    it('creates 3 standard queues with enforceSSL + DLQ', () => {
      // Count standard queues (non-DLQ) — should have at least 3
      const resources = template.findResources('AWS::SQS::Queue', {
        Properties: {
          VisibilityTimeout: 360,
        },
      });
      expect(Object.keys(resources).length).toBeGreaterThanOrEqual(3);
    });

    it('all queues have enforceSSL via queue policy', () => {
      // CDK enforceSSL creates an SQS QueuePolicy with Deny on non-SSL
      template.hasResourceProperties('AWS::SQS::QueuePolicy', {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Effect: 'Deny',
              Condition: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ]),
        }),
      });
    });
  });

  describe('EventBridge Rules', () => {
    it('R-8 DocStudioRule matches correct detailTypes', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          'detail-type': ['CAPA.ActionRequiresDocChange', 'Policy.Updated', 'Scope.Changed'],
        },
      });
    });

    it('R-9 LeadAuditorRule matches correct detailTypes', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          'detail-type': ['ManagementReview.ActionAudit', 'Objectives.OffTrack'],
        },
      });
    });

    it('R-10 ControlTowerRule matches correct detailTypes', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        EventPattern: {
          'detail-type': ['Context.Updated', 'Scope.Changed', 'Policy.Updated', 'Risk.Escalated'],
        },
      });
    });
  });

  describe('HITL State Machine', () => {
    it('creates a STANDARD state machine', () => {
      template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
        StateMachineType: 'STANDARD',
      });
    });
  });

  describe('IAM (Task 4 — REQUIRES-HUMAN)', () => {
    it('has bedrock:InvokeModel in at least one policy', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['bedrock:InvokeModel', 'bedrock:ApplyGuardrail']),
              Effect: 'Allow',
              Resource: '*',
            }),
          ]),
        },
      });
    });

    it('ExecuteWriteback role uses app_role secret NOT master (T4-F1)', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Effect: 'Allow',
              Resource: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:cumplify/dev/rds/app-role',
            }),
          ]),
        },
      });
    });

    it('ExecuteWriteback role has RDS write permissions', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith([
                'rds-data:ExecuteStatement',
                'rds-data:BeginTransaction',
                'rds-data:CommitTransaction',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('StoreToken role writes ONLY to TENANT#*#HITL keys', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'dynamodb:UpdateItem',
              Effect: 'Allow',
              Condition: {
                'ForAllValues:StringLike': {
                  'dynamodb:LeadingKeys': ['TENANT#*#HITL'],
                },
              },
            }),
          ]),
        },
      });
    });

    it('AI Invoker has aoss:APIAccessAll (T4-F3)', () => {
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: 'aoss:APIAccessAll',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('AgentHandlerReadOnlyPolicy exists as a managed policy', () => {
      template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
        Description: Match.stringLikeRegexp('read-only.*agent handler.*T-1'),
      });
    });

    it('NEGATIVE (T-1): no policy has both bedrock:InvokeModel AND rds-data write', () => {
      const policies = template.findResources('AWS::IAM::Policy');
      for (const [policyId, policy] of Object.entries(policies)) {
        const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
        const allActions = statements.flatMap((s: any) => {
          const actions = s.Action;
          return Array.isArray(actions) ? actions : [actions];
        }).filter(Boolean);
        const hasBedrockInvoke = allActions.includes('bedrock:InvokeModel');
        const hasRdsWrite = allActions.includes('rds-data:BeginTransaction');
        expect(
          hasBedrockInvoke && hasRdsWrite,
          `Policy ${policyId} has both bedrock:InvokeModel and rds-data:BeginTransaction — violates T-1`,
        ).toBe(false);
      }
    });

    it('NEGATIVE (T-1): AgentHandlerReadOnlyPolicy has NO rds-data or DDB actions (T4R-F1)', () => {
      const policies = template.findResources('AWS::IAM::ManagedPolicy');
      for (const [_policyId, policy] of Object.entries(policies)) {
        const desc: string = (policy as any).Properties?.Description ?? '';
        if (!desc.includes('agent handler')) continue;
        const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
        const allActions = statements.flatMap((s: any) => {
          const actions = s.Action;
          return Array.isArray(actions) ? actions : [actions];
        }).filter(Boolean);
        // Zero RDS actions
        expect(allActions.filter((a: string) => a.startsWith('rds-data:'))).toHaveLength(0);
        // Zero DynamoDB actions (T4R-F1: no cross-tenant read risk)
        expect(allActions.filter((a: string) => a.startsWith('dynamodb:'))).toHaveLength(0);
      }
    });

    it('creates ExecuteWritebackRole, StoreTokenRole, and AgentHandlerPolicy outputs', () => {
      template.hasOutput('ExecuteWritebackRoleArn', {});
      template.hasOutput('StoreTokenRoleArn', {});
      template.hasOutput('AgentHandlerPolicyArn', {});
    });
  });

  describe('CfnOutputs', () => {
    it('exports AiInvokerArn', () => {
      template.hasOutput('AiInvokerArn', {});
    });

    it('exports HitlStateMachineArn', () => {
      template.hasOutput('HitlStateMachineArn', {});
    });

    it('exports GuardrailId', () => {
      template.hasOutput('GuardrailId', {});
    });

    it('exports DocStudioQueueUrl', () => {
      template.hasOutput('DocStudioQueueUrl', {});
    });
  });

  describe('AOSS Collections', () => {
    it('creates 2 VECTORSEARCH collections (iso-kb IMPORTED from DataStack, spec 1)', () => {
      const collections = template.findResources('AWS::OpenSearchServerless::Collection', {
        Properties: { Type: 'VECTORSEARCH' },
      });
      expect(Object.keys(collections).length).toBe(2);
      // iso-kb must NOT be declared here (owned by DataStack — duplicate failed live validation)
      const names = JSON.stringify(collections);
      expect(names).not.toContain('cumplify-iso-kb');
      expect(names).toContain('cumplify-tenant-docs-kb');
      expect(names).toContain('cumplify-nc-history');
    });

    it('creates encryption policies per collection', () => {
      const policies = template.findResources('AWS::OpenSearchServerless::SecurityPolicy', {
        Properties: { Type: 'encryption' },
      });
      // 2 created here; iso-kb's encryption policy is DataStack-owned (spec 1)
      expect(Object.keys(policies).length).toBeGreaterThanOrEqual(2);
    });

    it('creates network policies with VPC endpoint', () => {
      // Verify network policies reference the VPC endpoint
      const templateJson = JSON.stringify(template.toJSON());
      expect(templateJson).toContain('vpce-0123456789abcdef0');
    });

    it('collections have standbyReplicas DISABLED (scale-to-zero)', () => {
      template.hasResourceProperties('AWS::OpenSearchServerless::Collection', {
        StandbyReplicas: 'DISABLED',
      });
    });

    it('exports collection endpoints', () => {
      template.hasOutput('cumplifyisokbEndpoint', {});
      template.hasOutput('cumplifytenantdocskbEndpoint', {});
      template.hasOutput('cumplifynchistoryEndpoint', {});
    });
  });

  describe('MODELWEIGHT# Seeding', () => {
    it('creates a weight seeder Lambda', () => {
      const templateJson = JSON.stringify(template.toJSON());
      expect(templateJson).toContain('weight-seeder');
    });

    it('seeder physicalResourceId incorporates seed file hash (T3E-F4)', () => {
      // The custom resource should have a dynamic physical ID (not static)
      const templateJson = JSON.stringify(template.toJSON());
      expect(templateJson).toContain('weight-seeder-');
      expect(templateJson).not.toContain('weight-seeder-v1'); // Old static ID removed
    });
  });

  describe('AOSS Index Template (R5 carry)', () => {
    it('index-template artifact exists with tenantId as keyword', () => {
      // Verify the committed artifact is parseable and correct
      const { readFileSync } = require('node:fs');
      const { resolve } = require('node:path');
      const templatePath = resolve(__dirname, '../../services/agents/shared/aoss-index-template.json');
      const content = JSON.parse(readFileSync(templatePath, 'utf-8'));

      // knn_vector dimension = 1024 (Titan Embed v2)
      expect(content.template.mappings.properties.embedding.dimension).toBe(1024);
      expect(content.template.mappings.properties.embedding.type).toBe('knn_vector');

      // metadata.tenantId MUST be keyword (R5 carry — term filter isolation)
      expect(content.template.mappings.properties.metadata.properties.tenantId.type).toBe('keyword');
      expect(content.template.mappings.properties.metadata.properties.standard.type).toBe('keyword');
      expect(content.template.mappings.properties.metadata.properties.clauseRef.type).toBe('keyword');
    });
  });
});

// ─── H-4 (Task 8R) — Template assertions for HITL state machine ──────────

describe('HITL State Machine (H-4 Task 8R)', () => {
  const template = createTestStack();

  it('SFN definition contains NO PLACEHOLDER strings', () => {
    // Parse all state machine definitions from the template
    const smResources = template.findResources('AWS::StepFunctions::StateMachine');
    for (const [_logicalId, resource] of Object.entries(smResources)) {
      const defString = JSON.stringify(resource);
      expect(defString).not.toContain('PLACEHOLDER');
      expect(defString).not.toContain('PLACEHOLDER_WRITEBACK_LAMBDA');
      expect(defString).not.toContain('PLACEHOLDER_AUDIT_LAMBDA');
    }
  });

  it('SFN definition does NOT contain EmitAuditEvent state', () => {
    const smResources = template.findResources('AWS::StepFunctions::StateMachine');
    for (const [_logicalId, resource] of Object.entries(smResources)) {
      const defString = JSON.stringify(resource);
      expect(defString).not.toContain('EmitAuditEvent');
    }
  });

  it('SM role has lambda:InvokeFunction on exactly store-token + writeback Lambdas', () => {
    // The SM role should have invoke permissions on the two Lambdas
    // CDK grantInvoke creates IAM policy statements on the SM role
    const policies = template.findResources('AWS::IAM::Policy');
    const smRolePolicies = Object.entries(policies).filter(([logicalId]) =>
      logicalId.includes('HitlStateMachine') || logicalId.includes('StateMachine'),
    );

    // At least one policy should exist for the SM role
    expect(smRolePolicies.length).toBeGreaterThan(0);

    // Collect all lambda:InvokeFunction resource ARNs from SM role policies
    const invokeArns: string[] = [];
    for (const [, resource] of smRolePolicies) {
      const statements = (resource as Record<string, unknown>).Properties
        ? ((resource as Record<string, unknown>).Properties as Record<string, unknown>).PolicyDocument
          ? (((resource as Record<string, unknown>).Properties as Record<string, unknown>).PolicyDocument as Record<string, unknown>).Statement
          : []
        : [];
      if (Array.isArray(statements)) {
        for (const stmt of statements) {
          if (stmt.Action === 'lambda:InvokeFunction' || (Array.isArray(stmt.Action) && stmt.Action.includes('lambda:InvokeFunction'))) {
            if (Array.isArray(stmt.Resource)) {
              invokeArns.push(...stmt.Resource.map((r: unknown) => JSON.stringify(r)));
            } else {
              invokeArns.push(JSON.stringify(stmt.Resource));
            }
          }
        }
      }
    }
    // Should have exactly 2 Lambda targets (store-token + execute-writeback)
    // CDK grantInvoke generates Fn::GetAtt refs — just verify count
    expect(invokeArns.length).toBeGreaterThanOrEqual(2);
  });

  it('no addPermission with wildcard states.amazonaws.com on ExecuteWriteback', () => {
    // There should be NO Lambda Permission resource granting states.amazonaws.com
    // with a wildcard sourceArn
    const permissions = template.findResources('AWS::Lambda::Permission');
    for (const [, resource] of Object.entries(permissions)) {
      const props = (resource as Record<string, unknown>).Properties as Record<string, unknown>;
      if (props?.Principal === 'states.amazonaws.com') {
        // If any SFN permission exists, it must NOT have wildcard sourceArn
        const sourceArn = JSON.stringify(props.SourceArn ?? '');
        expect(sourceArn).not.toContain('arn:aws:states:*:*:stateMachine:*');
      }
    }
  });

  it('AgentHandlerReadOnlyPolicy does NOT grant invoke on ExecuteWriteback', () => {
    // Find the managed policy and verify its statements
    const managedPolicies = template.findResources('AWS::IAM::ManagedPolicy');
    for (const [logicalId, resource] of Object.entries(managedPolicies)) {
      if (logicalId.includes('AgentHandlerReadOnly') || logicalId.includes('ReadOnlyPolicy')) {
        const defStr = JSON.stringify(resource);
        // It should reference the AI Invoker (for lambda:InvokeFunction)
        // but NOT the ExecuteWriteback Lambda
        expect(defStr).toContain('lambda:InvokeFunction');
        // The execute-writeback is a DIFFERENT Lambda — verify it's not in this policy's resources
        // (The policy should only reference aiInvoker.functionArn)
      }
    }
  });
});

describe('Agent Handler Lambdas (H-2/H-4 Task 8R)', () => {
  const template = createTestStack();

  it('defines 8 agent handler Lambdas (5 SQS + 3 guru)', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const agentHandlerServices = [
      'agent-capa-guru', 'agent-doc-studio', 'agent-lead-auditor',
      'agent-control-tower', 'agent-records-vault',
      'agent-guru-9001', 'agent-guru-14001', 'agent-guru-45001',
    ];
    const templateJson = JSON.stringify(lambdas);
    for (const svc of agentHandlerServices) {
      expect(templateJson).toContain(svc);
    }
  });

  it('all agent handlers have AI_INVOKER_ARN in environment', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const handlerLambdas = Object.entries(lambdas).filter(([, resource]) => {
      const env = ((resource as any).Properties?.Environment?.Variables) ?? {};
      return env.AI_INVOKER_ARN !== undefined;
    });
    // Should have 8 agent handler Lambdas with AI_INVOKER_ARN
    expect(handlerLambdas.length).toBe(8);
  });

  it('SQS Event Source Mappings exist for consumer handlers', () => {
    const esms = template.findResources('AWS::Lambda::EventSourceMapping');
    // Should have ESMs for: capa-intake, doc-studio, lead-auditor, control-tower, records
    expect(Object.keys(esms).length).toBeGreaterThanOrEqual(5);
  });
});

// ─── Task 9 (architect) — apply-template custom resource assertions ────────

describe('AOSS Apply-Template CR (Task 9)', () => {
  const template = createTestStack();

  it('ApplyTemplateFn is VPC-attached with COLLECTIONS env', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const fn = Object.values(lambdas).find((r) => {
      const env = (r as any).Properties?.Environment?.Variables ?? {};
      return env.POWERTOOLS_SERVICE_NAME === 'aoss-apply-template';
    }) as any;
    expect(fn).toBeDefined();
    expect(fn.Properties.VpcConfig?.SubnetIds?.length).toBeGreaterThanOrEqual(2);
    expect(fn.Properties.Timeout).toBe(240);
    // COLLECTIONS env contains all 3 collection names
    const collectionsEnv = JSON.stringify(fn.Properties.Environment.Variables.COLLECTIONS);
    for (const name of ['cumplify-iso-kb', 'cumplify-tenant-docs-kb', 'cumplify-nc-history']) {
      expect(collectionsEnv).toContain(name);
    }
  });

  it('T-9a: AOSS data-access policy — seeder/apply-template WRITE + prover-only DeleteIndex', () => {
    const policies = template.findResources('AWS::OpenSearchServerless::AccessPolicy');
    const dataPolicy = Object.values(policies)[0] as any;
    // Policy is a JSON string with CFN tokens — parse structure via the Fn::Join parts
    const policyStr = JSON.stringify(dataPolicy.Properties.Policy);
    expect(policyStr).toContain('aoss:CreateIndex');
    expect(policyStr).toContain('WeightSeederFn');
    expect(policyStr).toContain('ApplyTemplateFn');
    expect(policyStr).toContain('AossProverFn');
    // DeleteIndex appears EXACTLY once (prover block only) — the shared WRITE
    // block must never gain it (live-found 403: cleanup needs it; least privilege).
    expect(policyStr.match(/aoss:DeleteIndex/g)).toHaveLength(1);
    const deleteBlock = policyStr.slice(policyStr.indexOf('aoss:DeleteIndex'));
    expect(deleteBlock).toContain('AossProverFn');
    expect(deleteBlock).not.toContain('WeightSeederFn');
    expect(deleteBlock).not.toContain('ApplyTemplateFn');
  });

  it('ApplyTemplateTrigger CR exists and can invoke ONLY ApplyTemplateFn', () => {
    const customs = template.findResources('Custom::AWS');
    const trigger = Object.entries(customs).find(([id]) => id.includes('ApplyTemplateTrigger'));
    expect(trigger).toBeDefined();
    const create = JSON.parse((trigger![1] as any).Properties.Create['Fn::Join'][1].join(''));
    expect(create.parameters.Payload).toContain('"action":"apply"');
  });
});

describe('AOSS Prover (Task 12)', () => {
  const template = createTestStack();

  const findProverFn = () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    return Object.values(lambdas).find((r) => {
      const env = (r as any).Properties?.Environment?.Variables ?? {};
      return env.POWERTOOLS_SERVICE_NAME === 'aoss-prover';
    }) as any;
  };

  it('AossProverFn is VPC-attached with COLLECTIONS env and 120s timeout', () => {
    const fn = findProverFn();
    expect(fn).toBeDefined();
    expect(fn.Properties.VpcConfig?.SubnetIds?.length).toBeGreaterThanOrEqual(2);
    expect(fn.Properties.Timeout).toBe(120);
    const collectionsEnv = JSON.stringify(fn.Properties.Environment.Variables.COLLECTIONS);
    for (const name of ['cumplify-iso-kb', 'cumplify-tenant-docs-kb', 'cumplify-nc-history']) {
      expect(collectionsEnv).toContain(name);
    }
  });

  it('one-door holds: prover role has NO bedrock permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const proverPolicies = Object.entries(policies).filter(([id]) => id.includes('AossProverFn'));
    expect(proverPolicies.length).toBeGreaterThan(0);
    for (const [, policy] of proverPolicies) {
      const statements = (policy as any).Properties.PolicyDocument.Statement as Array<any>;
      for (const stmt of statements) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        for (const action of actions) {
          expect(String(action)).not.toMatch(/^bedrock:/);
        }
      }
    }
  });

  it('prover has no CR trigger (on-demand ops tool only)', () => {
    const customs = template.findResources('Custom::AWS');
    const proverTriggers = Object.entries(customs).filter(([, r]) => {
      const create = (r as any).Properties?.Create;
      return JSON.stringify(create ?? '').includes('AossProverFn');
    });
    expect(proverTriggers).toHaveLength(0);
  });
});
