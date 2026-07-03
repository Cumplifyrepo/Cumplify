/**
 * IdentityStack — 3 Cognito User Pools + PreTokenGeneration Lambda.
 * Per AC-5.1 through AC-5.5, NFR-2, design §2.1, §5.
 *
 * Pools:
 * - Pool A (cumplify-internal): MFA REQUIRED, internal staff (PlatformAdmin, etc.)
 * - Pool B (cumplify-tenant-admin): MFA OPTIONAL, tenant leadership
 * - Pool C (cumplify-tenant-user): MFA OPTIONAL, tenant workforce
 *
 * All pools: custom:tenantId immutable, PreTokenGeneration V1_0,
 * sign-in email, self-signup disabled, EMAIL_ONLY recovery,
 * deletion protection, RETAIN.
 */

import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';
import { type EnvConfig } from './env-config.js';

export interface IdentityStackProps extends cdk.StackProps {
  readonly envConfig: EnvConfig;
  readonly tableName: string;
}

/** Pool configuration */
interface PoolConfig {
  id: string;
  poolName: string;
  mfa: cognito.Mfa;
  groups: string[];
  poolClass: string;
}

export class IdentityStack extends cdk.Stack {
  public readonly poolAId: string;
  public readonly poolBId: string;
  public readonly poolCId: string;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    const { envConfig, tableName } = props;

    // -----------------------------------------------------------------------
    // PreTokenGeneration Lambda — Node.js 22.x, arm64, 5s timeout
    // Stamps tenantId + role + poolClass into ID token.
    // Falls back to Cognito group as role (logs fallback — no silent paths).
    // -----------------------------------------------------------------------
    const preTokenGenFn = new lambda.Function(this, 'PreTokenGenFn', {
      functionName: `cumplify-${envConfig.envName}-pre-token-gen`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('services/pre-token-gen'),
      timeout: cdk.Duration.seconds(5), // Cognito trigger hard cap
      memorySize: 128,
      environment: {
        TABLE_NAME: tableName,
        // POOL_CLASS_MAP is set after pool creation (circular avoidance)
      },
      description: 'PreTokenGeneration V1_0 — stamps tenantId/role/poolClass into ID token',
    });

    // -----------------------------------------------------------------------
    // Pool definitions
    // -----------------------------------------------------------------------
    const pools: PoolConfig[] = [
      {
        id: 'PoolA',
        poolName: `cumplify-${envConfig.envName}-internal`,
        mfa: cognito.Mfa.REQUIRED,
        groups: ['PlatformAdmin', 'SupportEngineer', 'FinanceOps', 'SecurityOps'],
        poolClass: 'internal',
      },
      {
        id: 'PoolB',
        poolName: `cumplify-${envConfig.envName}-tenant-admin`,
        mfa: cognito.Mfa.OPTIONAL,
        groups: ['TopManagement', 'IMSLead', 'QualityManager', 'EHSManager', 'DocumentController'],
        poolClass: 'tenant-admin',
      },
      {
        id: 'PoolC',
        poolName: `cumplify-${envConfig.envName}-tenant-user`,
        mfa: cognito.Mfa.OPTIONAL,
        groups: [
          'InternalAuditor',
          'ExternalAuditor',
          'ProcessOwner',
          'Supervisor',
          'Employee',
          'Contractor',
          'PartnerConsultant',
        ],
        poolClass: 'tenant-user',
      },
    ];

    const createdPools: Record<string, cognito.UserPool> = {};
    const poolClassMap: Record<string, string> = {};

    for (const poolConfig of pools) {
      const pool = new cognito.UserPool(this, poolConfig.id, {
        userPoolName: poolConfig.poolName,
        selfSignUpEnabled: false,
        signInAliases: { email: true },
        mfa: poolConfig.mfa,
        mfaSecondFactor: { otp: true, sms: false },
        accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        passwordPolicy: {
          minLength: 12,
          requireLowercase: true,
          requireUppercase: true,
          requireDigits: true,
          requireSymbols: true,
        },
        standardAttributes: {
          email: { required: true, mutable: true },
        },
        customAttributes: {
          // IMMUTABLE — write once at signup only. Never AdminUpdateUserAttributes after confirm.
          tenantId: new cognito.StringAttribute({ mutable: false }),
        },
        lambdaTriggers: {
          preTokenGeneration: preTokenGenFn,
        },
        deletionProtection: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // Create groups for this pool
      for (const groupName of poolConfig.groups) {
        new cognito.CfnUserPoolGroup(this, `${poolConfig.id}${groupName}`, {
          userPoolId: pool.userPoolId,
          groupName,
        });
      }

      // App client — authorization code flow (+ SRP for Pool B/C)
      const authFlows: cognito.AuthFlow =
        poolConfig.id === 'PoolA'
          ? { userSrp: false, custom: false, userPassword: false }
          : { userSrp: true, custom: false, userPassword: false };

      pool.addClient(`${poolConfig.id}Client`, {
        userPoolClientName: `${poolConfig.poolName}-client`,
        authFlows,
        oAuth: {
          flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
          scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
          callbackUrls: ['http://localhost:3000/callback'], // Placeholder — spec 3 updates
        },
        preventUserExistenceErrors: true,
        // Restrict read/write attributes — app clients cannot write custom:tenantId
        readAttributes: new cognito.ClientAttributes().withStandardAttributes({
          email: true,
          emailVerified: true,
        }),
        writeAttributes: new cognito.ClientAttributes().withStandardAttributes({
          email: true,
        }),
      });

      createdPools[poolConfig.id] = pool;
      poolClassMap[pool.userPoolId] = poolConfig.poolClass;

      // CDK Nag COG4/COG8 suppression — FeaturePlan.PLUS (advanced threat protection)
      // is not used because the cost is not justified for dev/staging and the
      // ESSENTIALS tier provides standard protections.
      NagSuppressions.addResourceSuppressions(pool, [
        {
          id: 'AwsSolutions-COG4',
          reason:
            'Cognito PLUS tier (advanced threat protection) not enabled. ESSENTIALS tier ' +
            'provides standard protections. PLUS adds ~$0.05/MAU/month cost that is not ' +
            'justified at this stage. Will be evaluated for prod hardening.',
        },
        {
          id: 'AwsSolutions-COG8',
          reason:
            'Cognito PLUS tier / feature plan not enabled. ESSENTIALS tier provides standard ' +
            'protections including MFA, password policies, and account recovery. PLUS tier ' +
            'cost (~$0.05/MAU/month) not justified at this stage.',
        },
      ]);
    }

    // Update PreTokenGen Lambda environment with pool class mapping
    // (Pool IDs are tokens at synth time — the map is resolved at deploy)
    preTokenGenFn.addEnvironment(
      'POOL_CLASS_MAP',
      cdk.Lazy.string({
        produce: () => JSON.stringify(poolClassMap),
      }),
    );

    // Export pool IDs
    this.poolAId = createdPools['PoolA'].userPoolId;
    this.poolBId = createdPools['PoolB'].userPoolId;
    this.poolCId = createdPools['PoolC'].userPoolId;

    // -----------------------------------------------------------------------
    // CDK Nag suppressions
    // -----------------------------------------------------------------------
    NagSuppressions.addResourceSuppressions(
      this,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'PreTokenGeneration Lambda execution role uses AWSLambdaBasicExecutionRole ' +
            '(CDK-generated). This is the standard minimal policy for Lambda logging.',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason:
            'Lambda execution role has logs:CreateLogGroup/PutLogEvents with wildcard on ' +
            'log stream name. This is the standard CDK pattern for Lambda logging.',
        },
        {
          id: 'AwsSolutions-COG1',
          reason:
            'Password policy meets all requirements (minLength 12, uppercase, lowercase, ' +
            'digits, symbols). CDK Nag may not detect the configuration on CfnUserPool.',
        },
        {
          id: 'AwsSolutions-COG2',
          reason:
            'MFA is configured per pool: Pool A REQUIRED, Pools B/C OPTIONAL. OPTIONAL ' +
            'allows tenant admins to enforce MFA at the organization level without blocking ' +
            'initial onboarding.',
        },
        {
          id: 'AwsSolutions-COG3',
          reason: 'AdvancedSecurityMode (PLUS tier) not enabled. See COG4 suppression reasoning.',
        },
        {
          id: 'AwsSolutions-L1',
          reason:
            'Lambda uses NODEJS_22_X which is the latest LTS runtime. CDK Nag rule may not ' +
            'recognize newer runtimes added after the rule was written.',
        },
      ],
      true,
    );
  }
}
