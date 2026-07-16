/**
 * Lambda invoke transport — C-1 one-door enforcement.
 * Agent handlers call the AI Invoker Lambda via LambdaClient/InvokeCommand.
 * They MUST NOT import invoke() directly from @cumplify/ai-invoker.
 *
 * This is the ONLY way agent handler code reaches Bedrock.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { InvokeRequest, InvokeResponse } from '../../ai-invoker/src/types.js';
import type { InvokeFn } from './tool-loop.js';

const lambdaClient = new LambdaClient({});
const AI_INVOKER_ARN = process.env.AI_INVOKER_ARN!;

/**
 * Create an invoke function that calls the AI Invoker Lambda synchronously.
 * Returns the parsed InvokeResponse from the one-door.
 */
export function createInvokeFn(): InvokeFn {
  return async (request: InvokeRequest): Promise<InvokeResponse> => {
    const result = await lambdaClient.send(
      new InvokeCommand({
        FunctionName: AI_INVOKER_ARN,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(request)),
      }),
    );

    if (result.FunctionError) {
      const errorPayload = result.Payload ? JSON.parse(Buffer.from(result.Payload).toString()) : {};
      throw new Error(
        `AI Invoker error: ${result.FunctionError} — ${errorPayload.errorMessage ?? 'unknown'}`,
      );
    }

    if (!result.Payload) {
      throw new Error('AI Invoker returned empty payload');
    }

    return JSON.parse(Buffer.from(result.Payload).toString()) as InvokeResponse;
  };
}
