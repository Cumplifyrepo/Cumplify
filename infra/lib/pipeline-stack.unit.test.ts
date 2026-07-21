/**
 * PipelineStack regression pin — SMOKE-1 fix.
 * Asserts the SmokeTest step:
 *   (a) does NOT contain `|| true` (failure must never be swallowed)
 *   (b) contains the content assertion `grep -q "<title>Cumplify</title>"`
 *   (c) wires FRONTEND_DOMAIN from the Staging FrontendStack output
 */

import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PipelineStack } from './pipeline-stack.js';

describe('PipelineStack — SmokeTest step', () => {
  const app = new cdk.App({
    context: {
      codestarConnectionArn:
        'arn:aws:codestar-connections:us-east-1:157082218687:connection/test-conn-id',
    },
  });
  const stack = new PipelineStack(app, 'TestPipelineStack', {
    env: { account: '157082218687', region: 'us-east-1' },
  });
  const template = Template.fromStack(stack);

  // Collect all CodeBuild project buildspecs that contain "SmokeTest"
  function getSmokeTestBuildSpecs(): string[] {
    const codeBuildProjects = template.findResources('AWS::CodeBuild::Project');
    const buildSpecs: string[] = [];

    for (const [, resource] of Object.entries(codeBuildProjects)) {
      const source = resource.Properties?.Source;
      if (!source?.BuildSpec) continue;
      const spec = typeof source.BuildSpec === 'string' ? source.BuildSpec : JSON.stringify(source.BuildSpec);
      // SmokeTest step will have the grep command in its buildspec
      if (spec.includes('Cumplify') || spec.includes('staging.cumplify.ai') || spec.includes('|| true')) {
        buildSpecs.push(spec);
      }
    }
    return buildSpecs;
  }

  it('(a) SmokeTest buildspec does NOT contain "|| true"', () => {
    const specs = getSmokeTestBuildSpecs();
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec).not.toContain('|| true');
    }
  });

  it('(b) SmokeTest buildspec contains the content assertion grep', () => {
    const specs = getSmokeTestBuildSpecs();
    expect(specs.length).toBeGreaterThan(0);
    const hasGrep = specs.some((s) => s.includes('grep -q') && s.includes('<title>Cumplify</title>'));
    expect(hasGrep).toBe(true);
  });

  it('(c) SmokeTest pipeline action wires FRONTEND_DOMAIN from the Staging FrontendStack output', () => {
    // Assert the ACTUAL wiring on the CodePipeline action, not the command
    // string — the buildspec contains "$FRONTEND_DOMAIN" regardless of whether
    // envFromCfnOutputs is present, so a buildspec check passes vacuously.
    const pipelines = template.findResources('AWS::CodePipeline::Pipeline');
    const stages = Object.values(pipelines).flatMap(
      (p) => (p.Properties?.Stages ?? []) as Array<{ Name: string; Actions: any[] }>,
    );
    const staging = stages.find((s) => s.Name === 'Staging');
    expect(staging).toBeDefined();
    const smoke = staging!.Actions.find((a) => a.Name === 'SmokeTest');
    expect(smoke).toBeDefined();
    const envVars = JSON.parse(smoke!.Configuration.EnvironmentVariables as string) as Array<{
      name: string;
      value: string;
    }>;
    const domainVar = envVars.find((v) => v.name === 'FRONTEND_DOMAIN');
    expect(domainVar).toBeDefined();
    // Namespace variable of the Staging FrontendStack deploy action, e.g.
    // #{CumplifyPipelineStagingFrontendStack<hash>.FrontendDistributionDomain}
    expect(domainVar!.value).toMatch(/^#\{.*StagingFrontendStack.*\.FrontendDistributionDomain\}$/);
  });
});
