import type { ModelInput } from "../models/Model.js";
import { estimateTokens } from "./estimateTokens.js";

export type ContextWindowOptions = {
  /** Input budget, after leaving room for the model's output. */
  maxInputTokens: number;
  /** Counts the entire request, including tools and response format. */
  countTokens?: (input: ModelInput) => number;
};

export class ContextWindow {
  private readonly maxInputTokens: number;
  private readonly countTokens: (input: ModelInput) => number;

  constructor(options: ContextWindowOptions) {
    if (!Number.isSafeInteger(options.maxInputTokens) || options.maxInputTokens <= 0) {
      throw new Error("contextWindow.maxInputTokens must be a positive safe integer.");
    }

    this.maxInputTokens = options.maxInputTokens;
    this.countTokens = options.countTokens ?? estimateTokens;
  }

  apply(input: ModelInput): ModelInput {
    let messages = input.messages;

    while (true) {
      const candidate = { ...input, messages };
      const tokens = this.countTokens(structuredClone(candidate));
      if (!Number.isSafeInteger(tokens) || tokens < 0) {
        throw new Error("contextWindow.countTokens must return a non-negative safe integer.");
      }

      if (tokens <= this.maxInputTokens) {
        return candidate;
      }

      const oldestTurnStart = messages.findIndex((message) => message.role === "user");
      const nextTurnStart = messages.findIndex((message, index) => (
        index > oldestTurnStart && message.role === "user"
      ));
      if (nextTurnStart === -1) {
        throw new Error(
          `Context window exceeded: ${tokens} input tokens, limit ${this.maxInputTokens}.`,
        );
      }

      messages = messages.filter((message, index) => (
        message.role === "system" || index >= nextTurnStart
      ));
    }
  }
}
