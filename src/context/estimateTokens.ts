import { Buffer } from "node:buffer";
import type { Message, ModelInput } from "../models/Model.js";

export type TokenEstimateOptions = {
  /** Fraction from 0 to 1 added to the estimate; defaults to 0.2 (20%). */
  safetyMargin?: number;
};

const MESSAGE_OVERHEAD = 4;
const DEFINITION_OVERHEAD = 8;
const REQUEST_OVERHEAD = 3;

/** Rough token estimate with framing and a safety margin. Not a guaranteed upper bound. */
export function estimateTokens(input: ModelInput, options: TokenEstimateOptions = {}): number {
  const safetyMargin = options.safetyMargin ?? 0.2;
  if (!Number.isFinite(safetyMargin) || safetyMargin < 0 || safetyMargin > 1) {
    throw new Error("safetyMargin must be between 0 and 1.");
  }

  let tokens = REQUEST_OVERHEAD;
  for (const message of input.messages) {
    tokens += estimateMessageTokens(message);
  }

  for (const tool of input.tools) {
    tokens += DEFINITION_OVERHEAD
      + estimateTextTokens(tool.name)
      + estimateTextTokens(tool.description)
      + estimateTextTokens(JSON.stringify(tool.inputSchema));
  }

  if (input.responseFormat) {
    tokens += DEFINITION_OVERHEAD + estimateTextTokens(JSON.stringify(input.responseFormat));
  }

  return Math.ceil(tokens * (1 + safetyMargin));
}

function estimateMessageTokens(message: Message): number {
  let tokens = MESSAGE_OVERHEAD + estimateTextTokens(message.content);
  if (message.role === "tool") {
    tokens += estimateTextTokens(message.toolCallId);
  }

  if (message.role === "assistant") {
    for (const call of message.toolCalls) {
      tokens += MESSAGE_OVERHEAD
        + estimateTextTokens(call.id)
        + estimateTextTokens(call.name)
        + estimateTextTokens(JSON.stringify(call.arguments));
    }
  }
  return tokens;
}

/** Uses a rough ASCII estimate and counts non-ASCII bytes as tokens. */
function estimateTextTokens(text: string): number {
  let asciiCharacters = 0;
  for (const character of text) {
    if (character <= "\x7f") asciiCharacters += 1;
  }
  const nonAsciiBytes = Buffer.byteLength(text, "utf8") - asciiCharacters;
  return Math.ceil(asciiCharacters / 4 + nonAsciiBytes);
}
