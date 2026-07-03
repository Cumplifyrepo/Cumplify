/**
 * NetworkStack — VPC, subnets, VPC endpoints, flow logs.
 * Per AC-2.1 through AC-2.5, design §6.
 *
 * - Private isolated subnets only (pinned AZs from AOSS intersection), zero NAT.
 * - EC2 Interface endpoints (control-plane): AOSS, Secrets Manager, KMS,
 *   bedrock-runtime, execute-api.
 * - OpenSearch Serverless VPC endpoint (data-plane): for indexing/querying AOSS
 *   collections. Required by AOSS network policies (SourceVPCEs accepts only
 *   AWS::OpenSearchServerless::VpcEndpoint IDs, not EC2 interface endpoint IDs).
 *   Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-vpcendpoint.html
 *   Ref: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-network.html
 * - Gateway endpoints: S3, DynamoDB.
 * - Flow logs to S3 bucket (90-day lifecycle, versioned).
 * - Note: ecr.api, ecr.dkr, logs endpoints deferred to ComputeStack.
 *   bedrock-agent-runtime deferred to spec 4 (AiStack).
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';

export interface NetworkStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  /**
   * Optional KMS key for flow-logs bucket encryption.
   * Supplied by SecurityStack (s3-general CMK) once task 1.3 wires it.
   * Falls back to SSE-S3 if not provided.
   */
  readonly flowLogsBucketKey?: kms.IKey;
}

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly privateSubnets: ec2.ISubnet[];
  public readonly endpointSecurityGroup: ec2.SecurityGroup;
  public readonly flowLogsBucket: s3.Bucket;
  /** OpenSearch Serverless-managed VPC endpoint ID (for AOSS network policy SourceVPCEs). */
  public readonly aossVpcEndpointId: string;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { envConfig, flowLogsBucketKey } = props;

    // -----------------------------------------------------------------------
    // Flow-logs S3 bucket — dedicated per design §6
    // 90-day lifecycle, versioned, no Object Lock (logs are renewable, not evidence).
    // No hardcoded bucketName — CloudFormation auto-names to avoid rollback collisions.
    // -----------------------------------------------------------------------
    const flowLogsBucket = new s3.Bucket(this, 'FlowLogsBucket', {
      versioned: true,
      encryption: flowLogsBucketKey ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
      encryptionKey: flowLogsBucketKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'ExpireFlowLogs90Days',
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(30),
        },
      ],
    });
    this.flowLogsBucket = flowLogsBucket;

    // Suppress S1 (server access logs) — flow-logs bucket is itself a log
    // destination; logging logs-of-logs creates infinite recursion.
    NagSuppressions.addResourceSuppressions(flowLogsBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'Flow-logs bucket is itself a log destination. Enabling access logs would create ' +
          'circular logging. VPC flow logs provide the audit trail for this bucket.',
      },
    ]);

    // -----------------------------------------------------------------------
    // VPC — private isolated subnets only, pinned AZs, zero NAT (AC-2.1, AC-2.4)
    // AZs are pinned to the AOSS-supported intersection per account (AC-2.5).
    // -----------------------------------------------------------------------
    const vpc = new ec2.Vpc(this, 'CumplifyVpc', {
      // Pin AZs to those supporting all VPC endpoint services (especially AOSS).
      // If availabilityZones is empty (staging/prod before first deploy), fall back
      // to maxAzs:2 — synth will succeed but deploy requires populating the array.
      ...(envConfig.availabilityZones.length > 0
        ? { availabilityZones: envConfig.availabilityZones }
        : { maxAzs: 2 }),
      natGateways: 0, // Zero NAT — AC-2.4, Part 25 cost lever
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // Flow logs to S3 bucket (AC-2.3, design §6)
    vpc.addFlowLog('FlowLogToS3', {
      destination: ec2.FlowLogDestination.toS3(flowLogsBucket, 'vpc-flow-logs/'),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    this.vpc = vpc;
    this.privateSubnets = vpc.isolatedSubnets;

    // CDK Nag VPC7 suppression: FlowLog IS configured via addFlowLog above.
    // cdk-nag L2 detection may not recognize the association. False positive.
    NagSuppressions.addResourceSuppressions(
      vpc,
      [
        {
          id: 'AwsSolutions-VPC7',
          reason:
            'FlowLog IS present — configured via vpc.addFlowLog(FlowLogToS3) targeting S3 bucket. ' +
            'AWS::EC2::FlowLog resource verified in synthesized template.',
        },
      ],
      true,
    );

    // -----------------------------------------------------------------------
    // Shared security group for VPC interface endpoints (AC-2.2)
    // -----------------------------------------------------------------------
    this.endpointSecurityGroup = new ec2.SecurityGroup(this, 'EndpointSG', {
      vpc,
      description: 'Allow HTTPS from VPC CIDR to interface endpoints',
      allowAllOutbound: false,
    });
    this.endpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'HTTPS from VPC CIDR to endpoints',
    );

    // -----------------------------------------------------------------------
    // EC2 Interface Endpoints — CONTROL-PLANE (AC-2.2)
    // com.amazonaws.us-east-1.aoss = control-plane API calls (CreateCollection,
    //   ListCollections, etc.) per:
    //   https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-vpc-cp.html
    // SecretsManager, KMS, bedrock-runtime, execute-api = standard service access.
    // -----------------------------------------------------------------------
    const interfaceEndpoints: Array<{ id: string; service: ec2.InterfaceVpcEndpointAwsService }> = [
      {
        id: 'AossControlPlaneEndpoint',
        service: new ec2.InterfaceVpcEndpointAwsService('aoss'),
      },
      { id: 'SecretsManagerEndpoint', service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER },
      { id: 'KmsEndpoint', service: ec2.InterfaceVpcEndpointAwsService.KMS },
      { id: 'BedrockRuntimeEndpoint', service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME },
      { id: 'ExecuteApiEndpoint', service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY },
    ];

    for (const ep of interfaceEndpoints) {
      vpc.addInterfaceEndpoint(ep.id, {
        service: ep.service,
        subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        securityGroups: [this.endpointSecurityGroup],
        privateDnsEnabled: true,
      });
    }

    // -----------------------------------------------------------------------
    // OpenSearch Serverless VPC Endpoint — DATA-PLANE
    // Required for AOSS network policy SourceVPCEs (accepts only AOSS-managed
    // endpoint IDs matching ^vpce-[a-zA-Z0-9]{8,20}$).
    // This is NOT the same as the EC2 interface endpoint above — this one is
    // created via AWS::OpenSearchServerless::VpcEndpoint and provides data-plane
    // access (indexing, querying) to AOSS collections.
    // Ref: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-opensearchserverless-vpcendpoint.html
    // Ref: https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless-vpc.html
    // -----------------------------------------------------------------------
    const aossDataPlaneEndpoint = new opensearchserverless.CfnVpcEndpoint(
      this,
      'AossDataPlaneEndpoint',
      {
        name: `cumplify-${envConfig.envName}-aoss`,
        vpcId: vpc.vpcId,
        subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
        securityGroupIds: [this.endpointSecurityGroup.securityGroupId],
      },
    );

    this.aossVpcEndpointId = aossDataPlaneEndpoint.attrId;

    // -----------------------------------------------------------------------
    // VPC Gateway Endpoints (AC-2.2) — S3 and DynamoDB (free)
    // -----------------------------------------------------------------------
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    // -----------------------------------------------------------------------
    // CDK Nag suppressions
    // -----------------------------------------------------------------------
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Flow log IAM role uses CDK-generated managed policy for s3:PutObject on the ' +
            'flow-logs bucket. This is the minimal permission set for VPC flow log delivery.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Flow log IAM role requires s3:PutObject with wildcard suffix (/*) on the flow-logs ' +
            'bucket to write log files with dynamic partition keys (account/region/date).',
        },
      ],
      true,
    );

    // EC23 validation failure: cdk-nag cannot evaluate Fn::GetAtt(VPC, CidrBlock)
    // in the security group ingress rule. The SG only allows HTTPS (443) from
    // the VPC's own CIDR — this is the tightest possible scope for endpoint access.
    NagSuppressions.addResourceSuppressions(
      this.endpointSecurityGroup,
      [
        {
          id: 'CdkNagValidationFailure',
          reason:
            'EC23 cannot validate Fn::GetAtt(CumplifyVpc, CidrBlock) at synth time. ' +
            'Security group ingress is restricted to VPC CIDR on port 443 only.',
        },
      ],
      true,
    );
  }
}
