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
 * Hook providing query/mutate helpers that auto-refresh the ID token per call.
 */
export function useGraphQL() {
  const { signOut } = useAuth();

  const query = useCallback(
    async <T = unknown>(
      statement: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      let token: string;
      try {
        token = await getFreshToken();
      } catch {
        await signOut();
        throw new Error('SESSION_EXPIRED');
      }

      const result = (await client.graphql({
        query: statement,
        variables: variables as never,
        authToken: token,
      })) as { data?: T; errors?: Array<{ message: string }> };
      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
      return result.data as T;
    },
    [signOut],
  );

  const mutate = useCallback(
    async <T = unknown>(
      statement: string,
      variables?: Record<string, unknown>,
    ): Promise<T> => {
      let token: string;
      try {
        token = await getFreshToken();
      } catch {
        await signOut();
        throw new Error('SESSION_EXPIRED');
      }

      const result = (await client.graphql({
        query: statement,
        variables: variables as never,
        authToken: token,
      })) as { data?: T; errors?: Array<{ message: string }> };
      if (result.errors?.length) {
        throw new Error(result.errors[0].message);
      }
      return result.data as T;
    },
    [signOut],
  );

  return { query, mutate, client };
}
