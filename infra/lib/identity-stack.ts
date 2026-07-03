/**
 * IdentityStack — 3 Cognito User Pools, PreTokenGeneration stub.
 * Placeholder for task 1.5. Minimal valid stack for synth.
 */

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { type EnvConfig } from './env-config.js';

export interface IdentityStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  readonly tableName: string;
}

export class IdentityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    // Placeholder — task 1.5 implements 3 pools + PreTokenGen Lambda
  }
}
