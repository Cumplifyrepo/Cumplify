import { describe, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { FrontendStack } from './frontend-stack.js';

describe('FrontendStack', () => {
  const app = new cdk.App();
  const stack = new FrontendStack(app, 'TestFrontendStack', {
    envConfig: { envName: 'dev', account: '123456789012', region: 'us-east-1' } as any,
    apiUrl: 'https://test.appsync-api.us-east-1.amazonaws.com/graphql',
  });
  const template = Template.fromStack(stack);

  it('creates S3 bucket with BlockPublicAccess BLOCK_ALL', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('creates CloudFront distribution with OAC origin', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
      },
    });
  });

  it('has custom error responses for SPA routing (403/404 → index.html)', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        CustomErrorResponses: [
          { ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' },
          { ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' },
        ],
      },
    });
  });

  it('exports FrontendBucketName, DistributionId, and DistributionDomain', () => {
    template.hasOutput('FrontendBucketName', {});
    template.hasOutput('FrontendDistributionId', {});
    template.hasOutput('FrontendDistributionDomain', {});
  });
});
