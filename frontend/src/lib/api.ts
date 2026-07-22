'use client';

import { useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { useAuth } from './auth-context';

/**
 * GraphQL client — CON-2/§3: generateClient with Lambda auth mode.
 * authToken = the Cognito ID token (the Lambda authorizer verifies issuer
 * + pinned audience of Pool B/C app clients — FIX-1).
 *
 * B3 fix: fetches a fresh token on EVERY query/mutate call via
 * fetchAuthSession() — Amplify auto-refreshes expired tokens. If refresh
 * fails, routes to /sign-in.
 */

// Singleton client instance (configured at module level after Amplify.configure)
const client = generateClient();

/** Fetch a fresh ID token string, throwing if unavailable. */
async function getFreshToken(): Promise<string> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('SESSION_EXPIRED');
  return token;
}

/**
 * Amplify's client.graphql REJECTS on GraphQL errors (mutations
 * especially), throwing the GraphQLResult object itself — not an Error —
 * so `.message` is undefined and every enforcement rejection (SoD,
 * approval matrix, sealed writes) surfaced as a generic "Action failed".
 * Found at the S1 UI witness 2026-07-22: the SoD 403 never reached the
 * HitlCard. Re-throw the FIRST GraphQL error's message as a real Error;
 * anything else passes through unchanged.
 */
function rethrowGraphQLError(err: unknown): never {
  const gqlErrors = (err as { errors?: Array<{ message?: string }> })?.errors;
  if (gqlErrors?.length && gqlErrors[0]?.message) {
    throw new Error(gqlErrors[0].message);
  }
  throw err;
}

/**
 * Hook providing query/mutate helpers that auto-refresh the ID token per call.
 */
export function useGraphQL() {
  const { signOut } = useAuth();

  const query = useCallback(
    async <T = unknown>(statement: string, variables?: Record<string, unknown>): Promise<T> => {
      let token: string;
      try {
        token = await getFreshToken();
      } catch {
        await signOut();
        throw new Error('SESSION_EXPIRED');
      }

      let result: { data?: T; errors?: Array<{ message: string }> };
      try {
        result = (await client.graphql({
          query: statement,
          variables: variables as never,
          authToken: token,
        })) as { data?: T; errors?: Array<{ message: string }> };
      } catch (err) {
        rethrowGraphQLError(err);
      }
      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
      return result.data as T;
    },
    [signOut],
  );

  const mutate = useCallback(
    async <T = unknown>(statement: string, variables?: Record<string, unknown>): Promise<T> => {
      let token: string;
      try {
        token = await getFreshToken();
      } catch {
        await signOut();
        throw new Error('SESSION_EXPIRED');
      }

      let result: { data?: T; errors?: Array<{ message: string }> };
      try {
        result = (await client.graphql({
          query: statement,
          variables: variables as never,
          authToken: token,
        })) as { data?: T; errors?: Array<{ message: string }> };
      } catch (err) {
        rethrowGraphQLError(err);
      }
      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
      return result.data as T;
    },
    [signOut],
  );

  return { query, mutate, client };
}
