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

export type ResponseFormat = {
  type: "json_schema";
  name: string;
  jsonSchema: Record<string, unknown>;
  strict?: boolean;
};

export type ModelInput = {
  messages: Message[];
  tools: ToolDefinition[];
  responseFormat?: ResponseFormat;
};

export type ModelOutput = {
  text: string;
  toolCalls: ToolCall[];
};

export type StreamChunk =
  | { type: "text_delta"; delta: string }
  | { type: "tool_call"; toolCall: ToolCall };

export interface Model {
  respond(input: ModelInput): Promise<ModelOutput>;
  respondStream?(input: ModelInput): AsyncIterable<StreamChunk>;
}
