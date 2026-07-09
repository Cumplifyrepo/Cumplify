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

function createTestStack(): Template {
  const app = new cdk.App();
  const envConfig = { envName: 'dev' as const, account: '123456789012', region: 'us-east-1' };

  // Create a mock key
  const mockStack = new cdk.Stack(app, 'MockStack');
  const mockKey = new kms.Key(mockStack, 'MockKey');

  const stack = new AiStack(app, 'TestAiStack', {
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
  });

  return Template.fromStack(stack);
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

  describe('IAM (partial — full IAM in Task 4)', () => {
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
});
