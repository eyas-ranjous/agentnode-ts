import OpenAI from "openai";

import type {
  Message,
  Model,
  ModelInput,
  ModelOutput,
  ToolCall,
} from "./Model.js";

export type OpenAIModelOptions = {
  model: string;
  apiKey?: string;
};

export class OpenAIModel implements Model {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIModelOptions) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    this.client = new OpenAI({ apiKey });
    this.model = options.model;
  }

  async respond(input: ModelInput): Promise<ModelOutput> {
    const openAIInput: OpenAI.Responses.ResponseInput = input.messages.flatMap(toOpenAIInput);
    const response = await this.client.responses.create({
      model: this.model,
      input: openAIInput,
      tools: input.tools.map((tool) => ({
        type: "function",
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        strict: false,
      })),
    });

    const toolCalls: ToolCall[] = response.output.flatMap((item) => {
      if (item.type !== "function_call") return [];

      return [{
        id: item.call_id,
        name: item.name,
        arguments: parseArguments(item.arguments),
      }];
    });

    return {
      text: response.output_text,
      toolCalls,
    };
  }
}

function toOpenAIInput(message: Message): OpenAI.Responses.ResponseInput {
  if (message.role === "tool") {
    return [{
      type: "function_call_output",
      call_id: message.toolCallId,
      output: message.content,
    }];
  }

  if (message.role === "assistant") {
    const items: OpenAI.Responses.ResponseInput = [];

    if (message.content) {
      items.push({
        role: "assistant",
        content: message.content,
      });
    }

    for (const call of message.toolCalls) {
      items.push({
        type: "function_call",
        call_id: call.id,
        name: call.name,
        arguments: JSON.stringify(call.arguments),
      });
    }

    return items;
  }

  return [{
    role: message.role,
    content: message.content,
  }];
}

function parseArguments(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
