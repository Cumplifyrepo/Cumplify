/**
 * SecurityStack — KMS CMKs, WAF ACLs, Secrets.
 * Placeholder for task 1.3 (REQUIRES-HUMAN). Minimal valid stack for synth.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { type EnvConfig } from './env-config.js';

export interface SecurityStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
}

export interface SecurityOutputs {
  // Placeholder — task 1.3 populates with real CMK references
}

export class SecurityStack extends cdk.Stack {
  public readonly outputs: SecurityOutputs = {};

  constructor(scope: Construct, id: string, props: SecurityStackProps) {
    super(scope, id, props);

    // Placeholder — task 1.3 implements 10 CMKs, WAF ACLs, Secrets
  }
}
