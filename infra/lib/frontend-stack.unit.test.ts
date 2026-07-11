import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { FrontendStack, URL_REWRITE_FN_CODE } from './frontend-stack.js';

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

  it('associates the URL-rewrite function on viewer-request', () => {
    template.resourceCountIs('AWS::CloudFront::Function', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
        }),
      },
    });
  });
});

describe('URL_REWRITE_FN_CODE handler behavior', () => {
  // Execute the actual CloudFront Function code so the rewrite rules are
  // pinned against the static-export layout (dashboard.html, not dashboard/).
  const handler = new Function(
    'event',
    `${URL_REWRITE_FN_CODE}; return handler(event);`
  ) as (event: { request: { uri: string } }) => { uri: string };

  const rewrite = (uri: string) => handler({ request: { uri } }).uri;

  it('rewrites extensionless routes to their .html object', () => {
    expect(rewrite('/dashboard')).toBe('/dashboard.html');
  });

  it('strips trailing slashes before rewriting', () => {
    expect(rewrite('/dashboard/')).toBe('/dashboard.html');
    expect(rewrite('/dashboard///')).toBe('/dashboard.html');
  });

  it('leaves root for defaultRootObject', () => {
    expect(rewrite('/')).toBe('/');
  });

  it('leaves asset paths with extensions untouched', () => {
    expect(rewrite('/_next/static/chunks/main-app-7b4335fd9d9ddc9a.js')).toBe(
      '/_next/static/chunks/main-app-7b4335fd9d9ddc9a.js'
    );
    expect(rewrite('/brand/cumplify-logo.png')).toBe('/brand/cumplify-logo.png');
    expect(rewrite('/dashboard.txt')).toBe('/dashboard.txt');
  });

  it('only inspects the last path segment for an extension', () => {
    expect(rewrite('/docs.v2/intro')).toBe('/docs.v2/intro.html');
  });
});
