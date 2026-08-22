import type {
  Message,
  Model,
  ModelOutput,
  ResponseFormat,
  StreamChunk,
} from "./models/Model.js";

import {
  type AgentSession,
} from "./sessions/AgentSession.js";

import {
  InMemoryAgentSession,
} from "./sessions/InMemoryAgentSession.js";

import type {
  Tool,
  ToolDefinition,
} from "./tools/Tool.js";

export type AgentNodeOptions = {
  model: Model;
  instructions?: string;
  tools?: Tool[];
  maxIterations?: number;
  history?: readonly Message[];
  responseFormat?: ResponseFormat;
};

export class AgentNode {
  private readonly model: Model;
  private readonly instructions: string | undefined;
  private readonly tools: Tool[];
  private readonly toolDefinitions: ToolDefinition[];
  private readonly toolRegistry: Map<string, Tool>;
  private readonly maxIterations: number;
  private readonly responseFormat: ResponseFormat | undefined;
  private readonly session: AgentSession;

  constructor(options: AgentNodeOptions) {
    this.model = options.model;
    this.instructions = options.instructions;
    this.tools = options.tools ?? [];
    this.maxIterations = options.maxIterations ?? 10;
    this.responseFormat = options.responseFormat;
    this.toolRegistry = new Map();

    for (const tool of this.tools) {
      if (this.toolRegistry.has(tool.name)) {
        throw new Error(
          `Duplicate tool: ${tool.name}`,
        );
      }
      this.toolRegistry.set(tool.name, tool);
    }

    this.toolDefinitions = this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const baseHistory: Message[] = [];
    if (this.instructions) {
      baseHistory.push({
        role: "system",
        content: this.instructions,
      });
    }

    let history = baseHistory;
    if (options.history !== undefined) {
      history = [...getInitialHistory(options.history)];
    }

    this.session = new InMemoryAgentSession({
      history,
      baseHistory,
      run: (sessionHistory) => this.runLoop(sessionHistory),
    });
  }

  async run(input: string): Promise<ModelOutput> {
    return this.session.run(input);
  }

  async *runStream(input: string): AsyncIterable<StreamChunk> {
    if (!this.model.respondStream) {
      throw new Error("Streaming is not supported by the current model.");
    }

    const messages = this.getHistoryForStream(input);
    const streamInput: Parameters<NonNullable<typeof this.model.respondStream>>[0] = {
      messages,
      tools: this.toolDefinitions,
    };
    if (this.responseFormat) {
      streamInput.responseFormat = this.responseFormat;
    }
    yield* this.model.respondStream(streamInput);
  }

  private getHistoryForStream(input: string): Message[] {
    const history = [...this.getHistory()];
    history.push({ role: "user", content: input });
    return history;
  }

  getHistory(): readonly Message[] {
    return this.session.getHistory();
  }

  reset(): void {
    this.session.reset();
  }

  private async runLoop(messages: Message[]): Promise<ModelOutput> {
    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const respondInput: Parameters<typeof this.model.respond>[0] = {
        messages,
        tools: this.toolDefinitions,
      };
      if (this.responseFormat) {
        respondInput.responseFormat = this.responseFormat;
      }
      const output = await this.model.respond(respondInput);

      messages.push({
        role: "assistant",
        content: output.text,
        toolCalls: structuredClone(output.toolCalls),
      });

      if (output.toolCalls.length === 0) {
        return output;
      }

      for (const call of output.toolCalls) {
        const tool = this.toolRegistry.get(call.name);
        if (!tool) {
          throw new Error(`Tool is not registered: ${call.name}`);
        }

        const result = await tool.execute(call.arguments);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    throw new Error(`Agent exceeded ${this.maxIterations} iterations.`);
  }
}

function getInitialHistory(history: readonly Message[]): readonly Message[] {
  if (!Array.isArray(history)) {
    throw new Error("Agent history must be an array.");
  }

  return history;
}
