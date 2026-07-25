import type {
  Message,
  Model,
  ModelOutput,
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
};

export class AgentNode {
  private readonly model: Model;
  private readonly instructions: string | undefined;
  private readonly tools: Tool[];
  private readonly toolDefinitions: ToolDefinition[];
  private readonly toolRegistry: Map<string, Tool>;
  private readonly maxIterations: number;
  private readonly session: AgentSession;

  constructor(options: AgentNodeOptions) {
    this.model = options.model;
    this.instructions = options.instructions;
    this.tools = options.tools ?? [];
    this.maxIterations = options.maxIterations ?? 10;
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

  getHistory(): readonly Message[] {
    return this.session.getHistory();
  }

  reset(): void {
    this.session.reset();
  }

  private async runLoop(messages: Message[]): Promise<ModelOutput> {
    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const output = await this.model.respond({
        messages,
        tools: this.toolDefinitions,
      });

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
