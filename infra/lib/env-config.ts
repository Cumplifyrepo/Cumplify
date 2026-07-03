/**
 * Environment configuration — drives stage-conditional resource parameters.
 * Per design §1.2 (F-3 resolution).
 */

export interface EnvConfig {
  readonly envName: 'dev' | 'staging' | 'prod';
  readonly account: string;
  readonly region: string;
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
