/**
 * Readback assertions — Spec 1 platform-foundation
 * Design §7: R-1 through R-23
 *
 * Run-mode semantics:
 * - Dev-NetworkStack not deployed → assertions register as vitest SKIPPED
 *   (no deployed spec resources to verify yet).
 * - Dev-NetworkStack deployed → post-deploy mode, ABSENT = FAIL.
 *
 * @dev — requires cumplify-dev-readonly profile for live account assertions.
 * Task 1.1 adds R-23 (FlowLog exists per VPC). Remaining assertions (R-1
 * through R-22) are added by task 1.6.
 */

import { describe, it, beforeAll } from 'vitest';
import { assertResource } from './helpers.js';

const PROFILE = 'cumplify-dev-readonly';

// ---------------------------------------------------------------------------
// AWS access helpers
// ---------------------------------------------------------------------------

async function hasAwsAccess(): Promise<boolean> {
  try {
    const { execSync } = await import('node:child_process');
    execSync(`aws sts get-caller-identity --profile ${PROFILE}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// VPC / FlowLog helpers
// ---------------------------------------------------------------------------

interface FlowLogInfo {
  FlowLogId: string;
  ResourceId: string; // VPC ID
  LogDestinationType: string;
  LogGroupName?: string;
  LogDestination?: string;
}

/**
 * Describe VPC Flow Logs for a given VPC.
 * Returns the list of FlowLog resources associated with the VPC, or null
 * if the call fails.
 */
async function getFlowLogsForVpc(vpcId: string): Promise<FlowLogInfo[] | null> {
  try {
    const { execSync } = await import('node:child_process');
    const output = execSync(
      `aws ec2 describe-flow-logs --filter "Name=resource-id,Values=${vpcId}" --profile ${PROFILE} --output json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const parsed = JSON.parse(output);
    return parsed.FlowLogs ?? [];
  } catch {
    return null;
  }
}

/**
 * Get the VPC ID from CloudFormation stack outputs or resources.
 * Looks for the NetworkStack's VPC resource.
 */
async function getVpcIdFromStack(): Promise<string | null> {
  try {
    const { execSync } = await import('node:child_process');
    // Find the VPC resource in the NetworkStack
    const output = execSync(
      `aws cloudformation describe-stack-resources --stack-name Dev-NetworkStack --profile ${PROFILE} --query "StackResources[?ResourceType=='AWS::EC2::VPC'].PhysicalResourceId" --output json`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15_000 },
    );
    const vpcIds = JSON.parse(output);
    return Array.isArray(vpcIds) && vpcIds.length > 0 ? vpcIds[0] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Platform Foundation — Readback Assertions', () => {
  let awsAvailable = false;
  let specStacksDeployed = false;

  beforeAll(async () => {
    awsAvailable = await hasAwsAccess();
    if (!awsAvailable) return;

    // Check if this spec's stacks are deployed (Dev-NetworkStack is the first).
    // If not deployed yet, all assertions gracefully skip.
    const vpcId = await getVpcIdFromStack();
    specStacksDeployed = vpcId !== null;
  });

  // -------------------------------------------------------------------------
  // R-23: FlowLog exists per VPC
  // Verifies AWS::EC2::FlowLog resource is associated with the CumplifyVpc.
  // FlowLog logical ID verified in synthesized templates: CumplifyVpcdefaultFlowLog7AB19280
  // (confirmed present in cdk.out on 2026-07-03).
  // -------------------------------------------------------------------------
  it('R-23: FlowLog exists for CumplifyVpc', async (ctx) => {
    if (!awsAvailable) {
      ctx.skip();
      return;
    }

    if (!specStacksDeployed) {
      console.log(
        'Dev-NetworkStack not deployed yet — skipping readback (pre-deploy for this spec).',
      );
      ctx.skip();
      return;
    }

    // Post-deploy mode: VPC exists, verify FlowLog.
    const vpcId = await getVpcIdFromStack();
    if (!vpcId) {
      // Should not happen since specStacksDeployed was true, but guard anyway.
      assertResource('Dev-NetworkStack/CumplifyVpc', 'FlowLog.exists', true, 'ABSENT');
      return;
    }

    const flowLogs = await getFlowLogsForVpc(vpcId);
    const hasFlowLog = flowLogs !== null && flowLogs.length > 0;

    assertResource(`ec2:vpc/${vpcId}`, 'FlowLog.exists', true, hasFlowLog);
  });
});
