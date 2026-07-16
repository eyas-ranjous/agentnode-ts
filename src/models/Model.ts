import type {
  ToolDefinition,
} from "../tools/Tool.js";

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type Message =
  | {
      role: "system" | "user";
      content: string;
    }
  | {
      role: "assistant";
      content: string;
      toolCalls: ToolCall[];
    }
  | {
      role: "tool";
      toolCallId: string;
      content: string;
    };

export type ModelInput = {
  messages: Message[];
  tools: ToolDefinition[];
};

export type ModelOutput = {
  text: string;
  toolCalls: ToolCall[];
};

export interface Model {
  respond(input: ModelInput): Promise<ModelOutput>;
}
