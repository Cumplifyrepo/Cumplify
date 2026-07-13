/**
 * Amplify v6 configuration — CON-2: values from build-time env (load-env.mjs
 * reads cdk-outputs.json → .env.local → NEXT_PUBLIC_*).
 *
 * Auth: Pool B (managers), SRP sign-in. Pool A never offered (BC-6).
 * API: AppSync GraphQL with Lambda authorizer, authToken = Cognito ID token.
 */
import { type ResourcesConfig } from 'aws-amplify';

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID!,
    },
  },
  API: {
    GraphQL: {
      endpoint: process.env.NEXT_PUBLIC_GRAPHQL_URL!,
      defaultAuthMode: 'lambda',
      region: 'us-east-1',
    },
  },
};
