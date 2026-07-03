/**
 * DataStack — DynamoDB, Aurora, ElastiCache, AOSS, S3 WORM.
 * Placeholder for task 1.4. Minimal valid stack for synth.
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { type EnvConfig } from './env-config.js';
import { type SecurityOutputs } from './security-stack.js';

export interface DataStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  readonly vpc: ec2.IVpc;
  readonly securityOutputs: SecurityOutputs;
}

export class DataStack extends cdk.Stack {
  public readonly tableName: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Placeholder — task 1.4 implements full data layer
    this.tableName = 'CumplifyCore';
  }
}
