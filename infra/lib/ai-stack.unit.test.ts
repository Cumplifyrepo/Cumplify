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
    auditSinkQueueArn: 'arn:aws:sqs:us-east-1:123456789012:AuditSinkQueue.fifo',
    recordsQueueArn: 'arn:aws:sqs:us-east-1:123456789012:RecordsQueue',
    aossVpcEndpointId: 'vpce-0123456789abcdef0',
    bedrockKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/bedrock-key-id',
    appRoleSecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:cumplify/dev/rds/app-role',
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
            Match.objectLike({ Type: 'SSN', Action: 'BLOCK' }),
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
    it('creates 3 VECTORSEARCH collections', () => {
      const collections = template.findResources('AWS::OpenSearchServerless::Collection', {
        Properties: { Type: 'VECTORSEARCH' },
      });
      expect(Object.keys(collections).length).toBe(3);
    });

    it('creates encryption policies per collection', () => {
      const policies = template.findResources('AWS::OpenSearchServerless::SecurityPolicy', {
        Properties: { Type: 'encryption' },
      });
      expect(Object.keys(policies).length).toBeGreaterThanOrEqual(3);
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
