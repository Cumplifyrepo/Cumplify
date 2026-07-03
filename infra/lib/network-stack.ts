/**
 * NetworkStack — VPC, subnets, endpoints, flow logs.
 * Placeholder for task 1.2. Minimal valid stack for synth.
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';

export interface NetworkStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    // Placeholder VPC — task 1.2 adds full endpoint set and dedicated flow-logs bucket.
    // Flow log added here to satisfy CDK Nag VPC7 immediately.
    const vpc = new ec2.Vpc(this, 'CumplifyVpc', {
      maxAzs: 2,
      natGateways: 0, // Zero NAT — AC-2.4, Part 25 cost lever
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      flowLogs: {
        default: {
          destination: ec2.FlowLogDestination.toCloudWatchLogs(),
          // Task 1.2 changes this to S3 destination per AC-2.3
        },
      },
    });

    this.vpc = vpc;

    // CDK Nag VPC7 suppression: FlowLog IS synthesized (verified in
    // cdk.out templates 2026-07-03) but cdk-nag L2 detection doesn't
    // recognize the flowLogs prop association. False positive.
    NagSuppressions.addResourceSuppressions(
      vpc,
      [
        {
          id: 'AwsSolutions-VPC7',
          reason:
            'FlowLog IS present in synthesized template (AWS::EC2::FlowLog resource verified in cdk.out 2026-07-03). cdk-nag detection false positive on L2 flowLogs prop.',
        },
      ],
      true,
    );
  }
}
