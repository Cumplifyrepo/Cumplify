/**
 * DrRegionStack — Cross-region DR stack in us-west-2 (prod-only).
 * Per AC-1.8: KMS ReplicaKey + S3 CRR destination bucket.
 *
 * Instantiated conditionally when envConfig.drRegionStack === true (prod).
 * This stack is deployed BEFORE Global Table replica or S3 CRR wiring
 * can be activated in DataStack (cross-region dependency).
 */

import * as cdk from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';

export interface DrRegionStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  /** ARN of the primary multi-region DynamoDB CMK in the primary region. */
  readonly primaryDynamodbKeyArn: string;
}

export class DrRegionStack extends cdk.Stack {
  /** ARN of the KMS ReplicaKey in the DR region. */
  public readonly replicaKeyArn: string;
  /** ARN of the S3 CRR destination bucket. */
  public readonly crrDestinationBucketArn: string;

  constructor(scope: Construct, id: string, props: DrRegionStackProps) {
    super(scope, id, props);

    const { envConfig, primaryDynamodbKeyArn } = props;

    // -----------------------------------------------------------------------
    // KMS ReplicaKey — replica of the multi-region DynamoDB CMK
    // CfnReplicaKey creates the replica in this region pointing to the primary.
    // -----------------------------------------------------------------------
    const replicaKey = new kms.CfnReplicaKey(this, 'DynamodbReplicaKey', {
      primaryKeyArn: primaryDynamodbKeyArn,
      keyPolicy: {
        Version: '2012-10-17',
        Id: 'dr-replica-key-policy',
        Statement: [
          {
            Sid: 'EnableRootAccountAccess',
            Effect: 'Allow',
            Principal: { AWS: `arn:aws:iam::${this.account}:root` },
            Action: 'kms:*',
            Resource: '*',
          },
          {
            Sid: 'AllowDynamoDBService',
            Effect: 'Allow',
            Principal: { Service: 'dynamodb.amazonaws.com' },
            Action: [
              'kms:Decrypt',
              'kms:DescribeKey',
              'kms:Encrypt',
              'kms:GenerateDataKey*',
              'kms:ReEncrypt*',
            ],
            Resource: '*',
            Condition: {
              StringEquals: {
                'kms:CallerAccount': this.account,
              },
            },
          },
        ],
      },
      description: `Cumplify ${envConfig.envName} DR replica of DynamoDB multi-region CMK`,
    });

    this.replicaKeyArn = replicaKey.attrKeyId;

    // -----------------------------------------------------------------------
    // S3 CRR Destination Bucket — Object Lock COMPLIANCE, CMK encrypted
    // This bucket receives replicated objects from the evidence vault.
    // -----------------------------------------------------------------------
    const crrDestinationBucket = new s3.Bucket(this, 'CrrDestinationBucket', {
      versioned: true,
      objectLockEnabled: true,
      objectLockDefaultRetention: s3.ObjectLockRetention.compliance(
        cdk.Duration.days(2555), // ~7 years — matches source evidence vault
      ),
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kms.Key.fromKeyArn(this, 'ReplicaKeyRef', replicaKey.attrKeyId),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.crrDestinationBucketArn = crrDestinationBucket.bucketArn;

    // -----------------------------------------------------------------------
    // CDK Nag suppressions
    // -----------------------------------------------------------------------
    NagSuppressions.addResourceSuppressions(crrDestinationBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'CRR destination bucket does not require access logging — it is a DR-only ' +
          'replica target. The source evidence vault in the primary region has access ' +
          'logging enabled. Adding logging here would create circular replication.',
      },
    ]);

    // -----------------------------------------------------------------------
    // CfnOutputs
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, 'ReplicaKeyArn', {
      value: replicaKey.attrKeyId,
      description: 'KMS ReplicaKey ARN for DynamoDB Global Table in DR region',
    });
    new cdk.CfnOutput(this, 'CrrDestinationBucketArn', {
      value: crrDestinationBucket.bucketArn,
      description: 'S3 CRR destination bucket ARN for evidence vault replication',
    });
    new cdk.CfnOutput(this, 'CrrDestinationBucketName', {
      value: crrDestinationBucket.bucketName,
      description: 'S3 CRR destination bucket name',
    });
  }
}
