/**
 * DataStack — DynamoDB, Aurora Serverless v2, ElastiCache Redis, AOSS, S3 WORM.
 * Per AC-4.1 through AC-4.6, NFR-4, design §3.
 *
 * Data stores:
 * - DynamoDB CumplifyCore (TableV2, on-demand, 9 GSIs, PITR, streams)
 * - Aurora Serverless v2 PostgreSQL 16.x (writer + reader, auto-pause dev)
 * - ElastiCache Redis (at-rest + transit encryption)
 * - AOSS VECTORSEARCH collection (cumplify-iso-kb, scale-to-zero)
 * - S3 evidence vault (Object Lock COMPLIANCE 2555-day)
 * - S3 general bucket (versioned, CMK)
 *
 * All CMKs received via props from SecurityStack.
 */

import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as opensearchserverless from 'aws-cdk-lib/aws-opensearchserverless';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';
import { type SecurityOutputs } from './security-stack.js';
import { DR_REGION } from './env-config.js';

export interface DataStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  readonly vpc: ec2.IVpc;
  /** OpenSearch Serverless-managed VPC endpoint ID for AOSS network policy. */
  readonly aossVpcEndpointId: string;
  readonly securityOutputs: SecurityOutputs;
  /** ARN of the KMS ReplicaKey in DR region (prod-only, from DrRegionStack). */
  readonly drReplicaKeyArn?: string;
  /** ARN of the S3 CRR destination bucket in DR region (prod-only, from DrRegionStack). */
  readonly crrDestinationBucketArn?: string;
}

export class DataStack extends cdk.Stack {
  public readonly tableName: string;
  public readonly tableArn: string;
  public readonly tableStreamArn: string;
  public readonly clusterEndpoint: string;
  public readonly clusterArn: string;
  public readonly dbSecretArn: string;
  public readonly evidenceBucketArn: string;
  public readonly evidenceBucketName: string;
  /** GeneralBucket (working data) — consumed by AiStack's generation plane (spec 40) */
  public readonly generalBucketName: string;
  public readonly generalBucketArn: string;
  /** iso-kb AOSS collection (spec 1) — imported by AiStack (spec 4) */
  public readonly isoKbCollectionArn: string;
  public readonly isoKbCollectionEndpoint: string;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const { envConfig, vpc, aossVpcEndpointId, securityOutputs } = props;

    // -----------------------------------------------------------------------
    // DynamoDB CumplifyCore — TableV2 (AC-4.1)
    // PK/SK, on-demand, CMK, PITR, streams, 9 GSIs, deletion protection, RETAIN
    // Prod-only: Global Table replica us-west-2 (multi-region key)
    // -----------------------------------------------------------------------
    const table = new dynamodb.TableV2(this, 'CumplifyCore', {
      tableName: 'CumplifyCore',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      encryption: dynamodb.TableEncryptionV2.customerManagedKey(
        securityOutputs.dynamodbKey,
        envConfig.globalTableReplica && props.drReplicaKeyArn
          ? { 'us-west-2': props.drReplicaKeyArn }
          : undefined,
      ),
      pointInTimeRecovery: true,
      dynamoStream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      ...(envConfig.globalTableReplica
        ? {
            replicas: [{ region: 'us-west-2' }],
          }
        : {}),
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI2',
          partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI3',
          partitionKey: { name: 'GSI3PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI3SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI4',
          partitionKey: { name: 'GSI4PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI4SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI5',
          partitionKey: { name: 'GSI5PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI5SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI6',
          partitionKey: { name: 'GSI6PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI6SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI7',
          partitionKey: { name: 'GSI7PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI7SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI8',
          partitionKey: { name: 'GSI8PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI8SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI9',
          partitionKey: { name: 'GSI9PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI9SK', type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    this.tableName = table.tableName;
    this.tableArn = table.tableArn;
    this.tableStreamArn = table.tableStreamArn!;

    // -----------------------------------------------------------------------
    // Secrets Manager — RDS master credentials (AC-3.4, created in DataStack
    // to avoid cross-stack circular dependency with Aurora cluster)
    // 30-day rotation. Prod-only: replica to us-west-2.
    // -----------------------------------------------------------------------
    const rdsSecret = new secretsmanager.Secret(this, 'RdsMasterSecret', {
      // No secretName — auto-generated to avoid recovery-window collision on rollback.
      // ARN flows via stack outputs; readback reads from cdk-outputs.json.
      description: 'RDS Aurora PostgreSQL master credentials',
      encryptionKey: securityOutputs.secretsKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'cumplify_admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      replicaRegions: envConfig.secretsReplica
        ? [{ region: DR_REGION, encryptionKey: securityOutputs.secretsKey }]
        : undefined,
    });

    // -----------------------------------------------------------------------
    // Aurora Serverless v2 PostgreSQL 16.x (AC-4.2)
    // Writer + reader (scaleWithWriter), private subnets, CMK, Secrets Manager
    // Dev/staging: minCapacity 0 (auto-pause), maxCapacity 4
    // Prod: minCapacity 0.5, maxCapacity from context
    // addRotationSingleUser 30-day (same VPC, secretsmanager endpoint)
    // -----------------------------------------------------------------------
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'AuroraSecurityGroup', {
      vpc,
      description: 'Aurora PostgreSQL cluster security group',
      allowAllOutbound: false,
    });
    // Allow inbound from VPC CIDR on PostgreSQL port
    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      'PostgreSQL from VPC',
    );

    const cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_4,
      }),
      enableDataApi: true,
      serverlessV2MinCapacity: envConfig.auroraMinCapacity,
      serverlessV2MaxCapacity: envConfig.auroraMaxCapacity,
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        publiclyAccessible: false,
      }),
      readers: [
        rds.ClusterInstance.serverlessV2('Reader', {
          scaleWithWriter: true,
          publiclyAccessible: false,
        }),
      ],
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      storageEncrypted: true,
      storageEncryptionKey: securityOutputs.rdsKey,
      credentials: rds.Credentials.fromSecret(rdsSecret),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      backup: { retention: cdk.Duration.days(7) },
    });

    // 30-day rotation — runs in same VPC, uses secretsmanager interface endpoint (no NAT)
    cluster.addRotationSingleUser({
      automaticallyAfter: cdk.Duration.days(30),
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    this.clusterEndpoint = cluster.clusterEndpoint.hostname;
    this.clusterArn = cluster.clusterArn;
    this.dbSecretArn = rdsSecret.secretArn;

    // -----------------------------------------------------------------------
    // ElastiCache Redis (AC-4.3)
    // Private subnets, at-rest + transit encryption, elasticache CMK
    // Dev: single cache.t4g.micro. Prod: multi-AZ.
    // -----------------------------------------------------------------------
    const cacheSubnetGroup = new elasticache.CfnSubnetGroup(this, 'CacheSubnetGroup', {
      description: 'Cumplify Redis subnet group (private isolated)',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
      cacheSubnetGroupName: `cumplify-${envConfig.envName}-redis`,
    });

    const cacheSg = new ec2.SecurityGroup(this, 'CacheSecurityGroup', {
      vpc,
      description: 'ElastiCache Redis security group',
      allowAllOutbound: false,
    });
    cacheSg.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(6379), 'Redis from VPC');

    const redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: `Cumplify ${envConfig.envName} Redis`,
      engine: 'redis',
      cacheNodeType: envConfig.cacheNodeType,
      numCacheClusters: envConfig.cacheMultiAz ? 2 : 1,
      multiAzEnabled: envConfig.cacheMultiAz,
      automaticFailoverEnabled: envConfig.cacheMultiAz,
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
      kmsKeyId: securityOutputs.elasticacheKey.keyArn,
      cacheSubnetGroupName: cacheSubnetGroup.cacheSubnetGroupName,
      securityGroupIds: [cacheSg.securityGroupId],
      port: 6379,
    });

    // -----------------------------------------------------------------------
    // AOSS VECTORSEARCH collection (AC-4.4)
    // cumplify-iso-kb, Titan Embed v2 1024 dims
    // Encryption: bedrock CMK. Network: VPC endpoint, no public.
    // Data-access: CFN exec role as PLACEHOLDER (specs 4/5 add real principals).
    // Dev/staging: standbyReplicas DISABLED. Prod: ENABLED.
    // 45-second cold-start rule: all AOSS reads MUST implement exponential
    // backoff with ≥45s timeout budget (scale-to-zero cold start up to 45s).
    // -----------------------------------------------------------------------
    const collectionName = 'cumplify-iso-kb';

    // Encryption policy
    new opensearchserverless.CfnSecurityPolicy(this, 'AossEncryptionPolicy', {
      name: `${collectionName}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          {
            ResourceType: 'collection',
            Resource: [`collection/${collectionName}`],
          },
        ],
        AWSOwnedKey: false,
        KmsARN: securityOutputs.bedrockKey.keyArn,
      }),
    });

    // Network policy — VPC endpoint only, no public access
    new opensearchserverless.CfnSecurityPolicy(this, 'AossNetworkPolicy', {
      name: `${collectionName}-net`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
            },
            {
              ResourceType: 'dashboard',
              Resource: [`collection/${collectionName}`],
            },
          ],
          AllowFromPublic: false,
          // SourceVPCEs accepts only OpenSearch Serverless-managed VPC endpoint IDs
          // (format vpce-xxxx, regex ^vpce-[a-zA-Z0-9]{8,20}$). This is the data-plane
          // endpoint created in NetworkStack (AWS::OpenSearchServerless::VpcEndpoint),
          // NOT the EC2 interface endpoint for control-plane API calls.
          SourceVPCEs: [aossVpcEndpointId],
          SourceServices: ['bedrock.amazonaws.com'],
        },
      ]),
    });

    // Data-access policy — PLACEHOLDER principal (CFN exec role)
    // Spec 4 adds Bedrock KB role; spec 5 adds audit-retrieval role.
    new opensearchserverless.CfnAccessPolicy(this, 'AossDataAccessPolicy', {
      name: `${collectionName}-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems',
              ],
            },
            {
              ResourceType: 'index',
              Resource: [`index/${collectionName}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
              ],
            },
          ],
          // PLACEHOLDER: CFN execution role. Real principals added by specs 4/5.
          Principal: [
            `arn:aws:iam::${this.account}:role/cdk-hnb659fds-cfn-exec-role-${this.account}-${this.region}`,
          ],
        },
      ]),
    });

    // AOSS collection
    const aossCollection = new opensearchserverless.CfnCollection(this, 'AossCollection', {
      name: collectionName,
      type: 'VECTORSEARCH',
      description: 'Cumplify ISO standards knowledge base (Titan Embed v2, 1024 dims)',
      standbyReplicas: envConfig.aossStandby ? 'ENABLED' : 'DISABLED',
    });

    // Ensure policies are created before the collection
    aossCollection.addDependency(this.node.findChild('AossEncryptionPolicy') as cdk.CfnResource);
    aossCollection.addDependency(this.node.findChild('AossNetworkPolicy') as cdk.CfnResource);

    // Exported for AiStack (spec 4): import instead of duplicate declaration
    this.isoKbCollectionArn = aossCollection.attrArn;
    this.isoKbCollectionEndpoint = aossCollection.attrCollectionEndpoint;

    // -----------------------------------------------------------------------
    // S3 Evidence Vault (AC-4.5)
    // Object Lock COMPLIANCE 2555-day, versioned, s3-general CMK, block public,
    // server access logs, RETAIN, eventBridge enabled.
    // Prod-only: CRR to us-west-2 (deferred — requires destination bucket in DR region).
    // -----------------------------------------------------------------------

    // Access logs bucket for the evidence vault
    const accessLogsBucket = new s3.Bucket(this, 'EvidenceAccessLogs', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ expiration: cdk.Duration.days(365) }],
    });

    NagSuppressions.addResourceSuppressions(accessLogsBucket, [
      {
        id: 'AwsSolutions-S1',
        reason:
          'This IS the access-logs bucket. Enabling access logs on itself creates infinite recursion.',
      },
    ]);

    const evidenceBucket = new s3.Bucket(this, 'EvidenceVault', {
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: securityOutputs.s3GeneralKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      objectLockEnabled: true,
      // SAFETY-NET default only — env-parameterized (see EnvConfig.evidenceRetention*).
      // Writers set a per-object retain-until-date from the TENANT's retention
      // policy (m4.retention_policies), which overrides this default.
      // Was hardcoded COMPLIANCE/2555d in EVERY env: that made the dev bucket
      // permanently undeletable after a single sealed object (COMPLIANCE cannot
      // be shortened by anyone, including root) and silently overrode every
      // tenant retention policy shorter than 7 years — breaking ISO 7.5.3
      // disposition and GDPR erasure. Fixed 2026-07-14 (bucket was still empty).
      objectLockDefaultRetention:
        envConfig.evidenceRetentionMode === 'COMPLIANCE'
          ? s3.ObjectLockRetention.compliance(
              cdk.Duration.days(envConfig.evidenceRetentionDays),
            )
          : s3.ObjectLockRetention.governance(
              cdk.Duration.days(envConfig.evidenceRetentionDays),
            ),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      eventBridgeEnabled: true,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'evidence-vault/',
      ...(envConfig.s3Crr && props.crrDestinationBucketArn
        ? {
            replicationRules: [
              {
                destination: s3.Bucket.fromBucketArn(
                  this,
                  'CrrDestination',
                  props.crrDestinationBucketArn,
                ),
                sseKmsEncryptedObjects: true,
                kmsKey: securityOutputs.s3GeneralKey,
              },
            ],
          }
        : {}),
    });

    this.evidenceBucketArn = evidenceBucket.bucketArn;
    this.evidenceBucketName = evidenceBucket.bucketName;

    // -----------------------------------------------------------------------
    // S3 General/Static bucket (AC-4.6)
    // Versioned, CMK, block public, RETAIN
    // -----------------------------------------------------------------------
    const generalBucket = new s3.Bucket(this, 'GeneralBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: securityOutputs.s3GeneralKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'general-bucket/',
    });
    this.generalBucketName = generalBucket.bucketName;
    this.generalBucketArn = generalBucket.bucketArn;

    // -----------------------------------------------------------------------
    // CDK Nag suppressions
    // -----------------------------------------------------------------------
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Aurora rotation Lambda and DynamoDB auto-scaling use CDK-generated managed policies ' +
            'with minimal required permissions for their specific functions.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Aurora rotation Lambda requires secretsmanager:GetSecretValue with wildcard on ' +
            'version stages. DynamoDB auto-scaling requires dynamodb:UpdateTable on the table. ' +
            'These are CDK-generated minimal wildcard patterns.',
        },
        {
          id: 'AwsSolutions-SMG4',
          reason:
            'RDS secret rotation is configured via cluster.addRotationSingleUser() above. ' +
            'CDK Nag may not detect the rotation schedule on the imported secret reference.',
        },
        {
          id: 'AwsSolutions-RDS6',
          reason:
            'IAM authentication is not used for the master credential — Secrets Manager rotation ' +
            'handles credential lifecycle. IAM auth will be configured for application roles in spec 3.',
        },
        {
          id: 'AwsSolutions-RDS10',
          reason:
            'Deletion protection IS enabled (deletionProtection: true). CDK Nag may not detect ' +
            'it on Serverless v2 clusters.',
        },
        {
          id: 'AwsSolutions-RDS11',
          reason:
            'Default PostgreSQL port 5432 is used. Non-standard ports provide security-through-' +
            'obscurity without real benefit in a private-only VPC with no public access.',
        },
        {
          id: 'AwsSolutions-RDS14',
          reason:
            'Aurora backtrack is not supported on Aurora PostgreSQL (only MySQL). This is an ' +
            'engine limitation, not a configuration choice.',
        },
        {
          id: 'AwsSolutions-RDS16',
          reason:
            'Aurora Serverless v2 does not support Multi-AZ DB clusters (that is Aurora Provisioned). ' +
            'HA is provided by the reader instance with scaleWithWriter.',
        },
        {
          id: 'AwsSolutions-EC23',
          reason:
            'Security group ingress uses VPC CIDR (Fn::GetAtt) which cdk-nag cannot evaluate at ' +
            'synth time. Access is restricted to VPC CIDR only, on specific ports.',
        },
        {
          id: 'CdkNagValidationFailure',
          reason:
            'Validation failures caused by Fn::GetAtt/Ref intrinsics that cdk-nag cannot resolve ' +
            'at synth time. All security groups restrict to VPC CIDR on specific ports.',
        },
        {
          id: 'AwsSolutions-S1',
          reason:
            'General bucket has access logging enabled (to access-logs bucket). Evidence vault ' +
            'has access logging enabled. Only the access-logs bucket itself lacks self-logging ' +
            '(suppressed separately).',
        },
      ],
      true,
    );

    // Suppress VPC7 false positive if it triggers on security groups
    NagSuppressions.addResourceSuppressions(
      [dbSecurityGroup, cacheSg],
      [
        {
          id: 'AwsSolutions-EC23',
          reason:
            'Security group uses VPC CIDR block (Fn::GetAtt) which cdk-nag cannot resolve. ' +
            'Access restricted to VPC CIDR on database-specific ports only.',
        },
        {
          id: 'CdkNagValidationFailure',
          reason:
            'EC23 cannot validate Fn::GetAtt(VPC, CidrBlock). SG is VPC CIDR-only, specific port.',
        },
      ],
      true,
    );

    // ElastiCache suppressions
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-AEC4',
          reason:
            'Multi-AZ is intentionally disabled for dev/staging (cost optimization). ' +
            'Prod enables multiAzEnabled=true via envConfig.cacheMultiAz.',
        },
        {
          id: 'AwsSolutions-AEC5',
          reason:
            'Default Redis port 6379 is used. Non-standard ports provide security-through-' +
            'obscurity without real benefit in a private-only VPC with no public access. ' +
            'Access controlled by security group (VPC CIDR only).',
        },
        {
          id: 'AwsSolutions-AEC6',
          reason:
            'Redis AUTH token is not configured at this stage. Application-level authentication ' +
            'will be added when the compute layer (ECS/Lambda) is wired in spec 3. Network ' +
            'isolation (private VPC, security group) provides the access boundary.',
        },
      ],
      true,
    );

    // -----------------------------------------------------------------------
    // CfnOutputs — per design §2 / F-9 (consumed by readback via cdk-outputs.json)
    // -----------------------------------------------------------------------
    new cdk.CfnOutput(this, 'TableName', { value: this.tableName });
    new cdk.CfnOutput(this, 'TableArn', { value: this.tableArn });
    new cdk.CfnOutput(this, 'TableStreamArn', { value: this.tableStreamArn });
    new cdk.CfnOutput(this, 'ClusterEndpoint', { value: this.clusterEndpoint });
    new cdk.CfnOutput(this, 'ClusterArn', { value: this.clusterArn });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecretArn });
    new cdk.CfnOutput(this, 'EvidenceBucketName', { value: evidenceBucket.bucketName });
    new cdk.CfnOutput(this, 'EvidenceBucketArn', { value: this.evidenceBucketArn });
    new cdk.CfnOutput(this, 'AccessLogsBucketName', { value: accessLogsBucket.bucketName });
    new cdk.CfnOutput(this, 'GeneralBucketName', { value: generalBucket.bucketName });
    new cdk.CfnOutput(this, 'AossCollectionEndpoint', {
      value: aossCollection.attrCollectionEndpoint,
    });
    new cdk.CfnOutput(this, 'AossCollectionName', { value: collectionName });
    new cdk.CfnOutput(this, 'CacheReplicationGroupId', { value: redisCluster.ref });
  }
}
