/**
 * Environment configuration — drives stage-conditional resource parameters.
 * Per design §1.2 (F-3 resolution).
 */

export interface EnvConfig {
  readonly envName: 'dev' | 'staging' | 'prod';
  readonly account: string;
  readonly region: string;
  /**
   * Pinned AZs for VPC creation. Must be the intersection of AZs that support
   * ALL required VPC endpoint services (especially com.amazonaws.us-east-1.aoss
   * which is NOT available in all AZs). AZ-name-to-physical mapping is randomized
   * per account — values are account-specific.
   *
   * Empty array [] = not yet populated (MUST run describe-vpc-endpoint-services
   * intersection query against the target account before first deploy).
   */
  readonly availabilityZones: string[];
  /**
   * IdC SAML metadata URL for Pool A federation (task 3.2). undefined =
   * federation not wired yet. The URL is console-only (no API exposes it):
   * IdC console -> Applications -> cumplify-pool-a-sso -> "IAM Identity Center
   * SAML metadata file". Setting it activates the Cognito SAML provider.
   */
  readonly samlMetadataUrl?: string;
  // Stage-conditional resource parameters
  readonly globalTableReplica: boolean;
  readonly drRegionStack: boolean;
  readonly secretsReplica: boolean;
  readonly s3Crr: boolean;
  readonly aossStandby: boolean;
  readonly auroraMinCapacity: number;
  readonly auroraMaxCapacity: number;
  readonly cacheMultiAz: boolean;
  readonly cacheNodeType: string;
}

export const ENV_CONFIGS: Record<string, EnvConfig> = {
  dev: {
    envName: 'dev',
    account: '697114252993',
    region: 'us-east-1',
    // Pinned to AOSS-supported AZs (verified: com.amazonaws.us-east-1.aoss
    // available in 1b/1c/1d only in account 697114252993, deploy #1 failure).
    availabilityZones: ['us-east-1b', 'us-east-1c'],
    // IdC app cumplify-pool-a-sso (apl-7223d822671e7fe5); metadata validated
    // 2026-07-04: HTTP 200, EntityDescriptor + signing cert (task 3.2).
    samlMetadataUrl:
      'https://portal.sso.us-east-1.amazonaws.com/saml/metadata/MTU3MDgyMjE4Njg3X2lucy03MjIzZDgyMjY3MWU3ZmU1',
    globalTableReplica: false,
    drRegionStack: false,
    secretsReplica: false,
    s3Crr: false,
    aossStandby: false,
    auroraMinCapacity: 0,
    auroraMaxCapacity: 4,
    cacheMultiAz: false,
    cacheNodeType: 'cache.t4g.micro',
  },
  staging: {
    envName: 'staging',
    account: '889007427685',
    region: 'us-east-1',
    // Populated 2026-07-04 from describe-vpc-endpoint-services intersection
    // in account 889007427685: aoss/bedrock/kms/secretsmanager/execute-api all
    // support b,c (aoss constrains to b,c,d). Evidence: 3.1-az-intersection.log.
    availabilityZones: ['us-east-1b', 'us-east-1c'],
    globalTableReplica: false,
    drRegionStack: false,
    secretsReplica: false,
    s3Crr: false,
    aossStandby: false,
    auroraMinCapacity: 0,
    auroraMaxCapacity: 4,
    cacheMultiAz: false,
    cacheNodeType: 'cache.t4g.micro',
  },
  prod: {
    envName: 'prod',
    account: '077405654066',
    region: 'us-east-1',
    // Populated 2026-07-04 from describe-vpc-endpoint-services intersection
    // in account 077405654066: aoss/bedrock/kms/secretsmanager/execute-api all
    // support b,c (aoss constrains to b,c,d). Evidence: 3.1-az-intersection.log.
    availabilityZones: ['us-east-1b', 'us-east-1c'],
    globalTableReplica: true,
    drRegionStack: true,
    secretsReplica: true,
    s3Crr: true,
    aossStandby: true,
    auroraMinCapacity: 0.5,
    auroraMaxCapacity: 16,
    cacheMultiAz: true,
    cacheNodeType: 'cache.t4g.medium',
  },
};

export const MGMT_ACCOUNT = '157082218687';
export const PRIMARY_REGION = 'us-east-1';
export const DR_REGION = 'us-west-2';
