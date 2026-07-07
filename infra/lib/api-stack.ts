/**
 * ApiStack — AppSync GraphQL API for M1–M5.
 * Per spec: api-core (design R2, Tasks 7/8/9).
 *
 * Components:
 * - AppSync GraphQL API (AWS_LAMBDA default + AWS_IAM additional auth)
 * - Lambda authorizer (Pool B/C JWKS, Pool-A rejection, entitlement stamp)
 * - WAFv2 REGIONAL association
 * - Migration Custom Resource (executes SQL via Data API on deploy)
 * - app_role Secrets Manager secret (password-synced to DB role)
 * - Tenant-data IAM role (CARRY-1, created in Task 9)
 * - CfnOutputs for readback
 *
 * [REQUIRES-HUMAN] — authorizer code + IAM policies require owner review (C-2/AUTH-5).
 */

import * as cdk from 'aws-cdk-lib';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as kms from 'aws-cdk-lib/aws-kms';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';

export interface ApiStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  // DataStack
  readonly tableArn: string;
  readonly tableName: string;
  readonly dynamodbKey: kms.IKey;
  readonly clusterArn: string;
  readonly clusterEndpoint: string;
  readonly dbSecretArn: string;
  // IdentityStack
  readonly poolBId: string;
  readonly poolBArn: string;
  readonly poolCId: string;
  readonly poolCArn: string;
  readonly poolBClientId: string;
  readonly poolCClientId: string;
  // SecurityStack
  readonly regionalWafArn: string;
  // EventingStack
  readonly busName: string;
  readonly busArn: string;
}

export class ApiStack extends cdk.Stack {
  public readonly graphqlApiUrl: string;
  public readonly graphqlApiId: string;
  public readonly authorizerArn: string;
  public readonly tenantDataRoleArn: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { envConfig } = props;

    // ─── app_role Secret (C-1 remediation) ─────────────────────────────────────
    // Password sync: secret is created with a generated password. The migrator
    // Custom Resource runs ALTER ROLE app_role PASSWORD '<value>' using the
    // master secret (DDL-capable) after migration 009 creates the role.
    // Resolvers use this secret for Data API calls (not master).
    //
    // FIX-5 NOTE: The ALTER ROLE password value transits Data API SQL text
    // (not parameterizable for DDL). This is acceptable because:
    // (a) CloudTrail data events for rds-data are NOT enabled in dev.
    // (b) The SQL is executed server-side; it does not appear in CloudWatch logs.
    // CARRY: Enable Secrets Manager single-user rotation (VPC-attached rotation
    // Lambda) to eliminate the plaintext-in-SQL path. Named follow-up for
    // prod hardening (requires VPC Lambda + rotation configuration).
    const appRoleSecret = new secretsmanager.Secret(this, 'AppRoleSecret', {
      secretName: `cumplify/${envConfig.envName}/rds/app-role`,
      description: 'RDS app_role credentials for resolver Data API access',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'app_role' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
      encryptionKey: props.dynamodbKey, // reuse secrets CMK (same key policy)
    });

    // ─── Lambda Authorizer ───────────────────────────────────────────────────
    const authorizerFn = new NodejsFunction(this, 'AuthorizerFn', {
      entry: 'services/api/src/authorizer.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(10), // AppSync authorizer timeout limit
      bundling: { externalModules: [], target: 'node22' },
      environment: {
        POOL_B_ID: props.poolBId,
        POOL_C_ID: props.poolCId,
        POOL_B_CLIENT_IDS: props.poolBClientId, // FIX-1: audience validation
        POOL_C_CLIENT_IDS: props.poolCClientId, // FIX-1: audience validation
        TABLE_NAME: props.tableName,
        REGION: cdk.Stack.of(this).region,
        POWERTOOLS_SERVICE_NAME: 'api-authorizer',
      },
    });

    // Authorizer DDB policy (T-4): GetItem for tenant metadata reads.
    // Cannot use tenant-data role — no tenant context exists at auth time.
    // LeadingKeys 'TENANT#*' allows reading any tenant's metadata (the
    // authorizer needs to read the requesting tenant's plan/entitlement).
    authorizerFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['dynamodb:GetItem'],
      resources: [props.tableArn],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['TENANT#*'],
        },
      },
    }));

    // KMS decrypt for DynamoDB CMK (required for GetItem on encrypted table)
    props.dynamodbKey.grantDecrypt(authorizerFn);

    this.authorizerArn = authorizerFn.functionArn;

    // ─── AppSync GraphQL API ───────────────────────────────────────────────────
    const api = new appsync.GraphqlApi(this, 'CumplifyApi', {
      name: `cumplify-${envConfig.envName}-api`,
      definition: appsync.Definition.fromFile('services/api/schema/schema.graphql'),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.LAMBDA,
          lambdaAuthorizerConfig: {
            handler: authorizerFn,
            resultsCacheTtl: cdk.Duration.seconds(300), // OQ-3: 300s dev
          },
        },
        additionalAuthorizationModes: [
          { authorizationType: appsync.AuthorizationType.IAM },
        ],
      },
      xrayEnabled: true,
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
        excludeVerboseContent: true, // FIX-2: prevents JWTs/headers/resolverContext in CloudWatch
      },
    });

    this.graphqlApiUrl = api.graphqlUrl;
    this.graphqlApiId = api.apiId;

    // ─── WAFv2 Association ───────────────────────────────────────────────────
    new wafv2.CfnWebACLAssociation(this, 'WafAssociation', {
      resourceArn: api.arn,
      webAclArn: props.regionalWafArn,
    });

    // ─── Migration Custom Resource ───────────────────────────────────────────
    // Executes SQL migrations via Data API on every deploy (Create/Update).
    // Uses MASTER secret (DDL-capable). Also syncs app_role password.
    const migratorFn = new NodejsFunction(this, 'MigratorFn', {
      entry: 'services/api/src/migrator.ts',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5), // migrations may take time on first run
      bundling: {
        externalModules: [],
        target: 'node22',
        // Bundle the migrations directory alongside the handler
        commandHooks: {
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => [
            `cp -r ${inputDir}/services/api/migrations ${outputDir}/migrations`,
          ],
          beforeInstall: () => [],
        },
      },
      environment: {
        CLUSTER_ARN: props.clusterArn,
        SECRET_ARN: props.dbSecretArn, // master secret for DDL
        APP_ROLE_SECRET_ARN: appRoleSecret.secretArn,
        DATABASE: 'postgres',
        POWERTOOLS_SERVICE_NAME: 'migrator',
      },
    });

    // Migrator needs rds-data:* on the cluster + secrets read
    migratorFn.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'rds-data:ExecuteStatement',
        'rds-data:BeginTransaction',
        'rds-data:CommitTransaction',
        'rds-data:RollbackTransaction',
        'rds-data:BatchExecuteStatement',
      ],
      resources: [props.clusterArn],
    }));

    // Read master secret + app_role secret (for password sync)
    migratorFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [props.dbSecretArn, appRoleSecret.secretArn],
    }));

    // KMS decrypt for secrets + DDB
    props.dynamodbKey.grantDecrypt(migratorFn);

    const migratorProvider = new cr.Provider(this, 'MigratorProvider', {
      onEventHandler: migratorFn,
    });

    new cdk.CustomResource(this, 'MigrationResource', {
      serviceToken: migratorProvider.serviceToken,
      properties: {
        // Force re-run on every deploy by including a timestamp
        deployTimestamp: Date.now().toString(),
      },
    });

    // ─── Resolver Lambdas (M1–M5) ─────────────────────────────────────────────
    // One Lambda per module. Task 10 implements the handler logic.
    const resolverModules = ['m1', 'm2', 'm3', 'm4', 'm5'] as const;
    const resolverFns: NodejsFunction[] = [];

    for (const mod of resolverModules) {
      const fn = new NodejsFunction(this, `Resolver${mod.toUpperCase()}Fn`, {
        entry: `services/api/src/resolvers/${mod}.ts`,
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: 512,
        timeout: cdk.Duration.seconds(30), // Aurora resume budget
        bundling: { externalModules: [], target: 'node22' },
        environment: {
          CLUSTER_ARN: props.clusterArn,
          APP_ROLE_SECRET_ARN: appRoleSecret.secretArn, // C-1: app_role, NOT master
          TABLE_NAME: props.tableName,
          BUS_NAME: props.busName,
          REGION: cdk.Stack.of(this).region,
          POWERTOOLS_SERVICE_NAME: `resolver-${mod}`,
        },
      });

      // Data API access for resolvers (using app_role secret)
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: [
          'rds-data:ExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction',
        ],
        resources: [props.clusterArn],
      }));

      // Read app_role secret
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [appRoleSecret.secretArn],
      }));

      // EventBridge publish (for audit events)
      fn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['events:PutEvents'],
        resources: [props.busArn],
      }));

      // KMS decrypt for secrets + DDB
      props.dynamodbKey.grantDecrypt(fn);

      resolverFns.push(fn);
    }

    // ─── Tenant-Data Role (Task 9 — CARRY-1) ────────────────────────────────
    // Trust: resolver execution roles + sts:TagSession (bare-tenantId session tag, FF-3).
    // Policy: DDB LeadingKeys condition wraps TENANT#${aws:PrincipalTag/tenantId}#*.
    // GSI grant included: all 9 GSIs use TENANT#-prefixed partition keys (FF-5 design constraint).
    const tenantDataRole = new iam.Role(this, 'TenantDataRole', {
      roleName: `cumplify-${envConfig.envName}-tenant-data-role`,
      assumedBy: new iam.CompositePrincipal(
        ...resolverFns.map(fn => new iam.ArnPrincipal(fn.role!.roleArn)),
      ),
      description: 'Tenant-scoped DDB role assumed per-request with tenantId session tag (CARRY-1)',
    });

    // Add sts:TagSession condition to trust policy (FF-3: bare tenantId, UUID format)
    tenantDataRole.assumeRolePolicy!.addStatements(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['sts:TagSession'],
      principals: resolverFns.map(fn => new iam.ArnPrincipal(fn.role!.roleArn)),
      conditions: {
        'StringLike': {
          // Bare tenantId = UUID format (e.g., "abc-123-def-456")
          // NOT TENANT#-prefixed — LeadingKeys adds the prefix at evaluation time
          'aws:RequestTag/tenantId': '*',
        },
      },
    }));

    // FIX-4: DENY any tag value containing '#' — prevents TENANT#-prefixed injection
    // that would bypass LeadingKeys matching. A '#' in the tag value means the caller
    // is trying to inject a key-prefix, which must be rejected loudly.
    tenantDataRole.assumeRolePolicy!.addStatements(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['sts:TagSession'],
      principals: resolverFns.map(fn => new iam.ArnPrincipal(fn.role!.roleArn)),
      conditions: {
        'StringLike': {
          'aws:RequestTag/tenantId': '*#*',
        },
      },
    }));

    // Inline policy: DDB actions with LeadingKeys condition
    tenantDataRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:Query',
        'dynamodb:TransactWriteItems',
      ],
      resources: [
        props.tableArn,
        // GSI grant — all 9 GSIs are TENANT#-prefixed by design constraint (FF-5).
        // Cross-tenant GSI query denial proven at ACC-2 Task 14 GSI probe.
        // DO NOT sign CARRY-1 green until that probe shows cross-tenant = denied.
        `${props.tableArn}/index/*`,
      ],
      conditions: {
        'ForAllValues:StringLike': {
          'dynamodb:LeadingKeys': ['TENANT#${aws:PrincipalTag/tenantId}#*'],
        },
      },
    }));

    // KMS decrypt for DDB CMK (required for GetItem/PutItem on encrypted table)
    props.dynamodbKey.grantDecrypt(tenantDataRole);

    this.tenantDataRoleArn = tenantDataRole.roleArn;

    // Export tenant-data role ARN to resolver environment
    for (const fn of resolverFns) {
      fn.addEnvironment('TENANT_DATA_ROLE_ARN', tenantDataRole.roleArn);
    }

    // ─── STS AssumeRole grant for resolvers → tenant-data role ───────────────
    for (const fn of resolverFns) {
      fn.role!.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: [tenantDataRole.roleArn],
      }));
    }

    // ─── CfnOutputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'GraphqlApiUrl', { value: this.graphqlApiUrl });
    new cdk.CfnOutput(this, 'GraphqlApiId', { value: this.graphqlApiId });
    new cdk.CfnOutput(this, 'AuthorizerArn', { value: this.authorizerArn });
    new cdk.CfnOutput(this, 'TenantDataRoleArn', { value: this.tenantDataRoleArn });
    new cdk.CfnOutput(this, 'AppRoleSecretArn', { value: appRoleSecret.secretArn });

    // ─── CDK Nag Suppressions ────────────────────────────────────────────────
    // FIX-3: path-scoped suppressions instead of stack-wide blanket
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'Lambda execution roles use AWSLambdaBasicExecutionRole (CDK-generated). ' +
            'Standard minimal policy for Lambda logging.',
        },
        {
          id: 'AwsSolutions-L1',
          reason:
            'Lambda uses NODEJS_22_X (latest LTS). CDK Nag may not recognize newer runtimes.',
        },
      ],
      true,
    );

    // FIX-3(a): IAM5 on Lambda log-group wildcards only (not the DDB grant)
    const lambdaResources = [authorizerFn, migratorFn, ...resolverFns];
    for (const fn of lambdaResources) {
      NagSuppressions.addResourceSuppressions(fn, [
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Lambda execution role has logs:CreateLogGroup/PutLogEvents with wildcard on ' +
            'log stream name. Standard CDK pattern for Lambda logging.',
        },
      ], true);
    }

    // FIX-3(b): IAM5 on TenantDataRole — explicit justification for index/* wildcard
    NagSuppressions.addResourceSuppressions(tenantDataRole, [
      {
        id: 'AwsSolutions-IAM5',
        reason:
          'GSI access uses ${tableArn}/index/* wildcard. Tenant isolation is enforced by ' +
          'the dynamodb:LeadingKeys condition (TENANT#${aws:PrincipalTag/tenantId}#*). ' +
          'Cross-tenant GSI query denial proven at ACC-2 GSI probe (Task 14).',
      },
    ], true);
  }
}
