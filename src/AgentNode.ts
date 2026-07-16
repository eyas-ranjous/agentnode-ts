import type {
  Message,
  Model,
  ModelOutput,
} from "./models/Model.js";

import type {
  Tool,
  ToolDefinition,
} from "./tools/Tool.js";

export type AgentNodeOptions = {
  model: Model;
  instructions?: string;
  tools?: Tool[];
  maxIterations?: number;
};

export class AgentNode {
  private readonly model: Model;
  private readonly instructions: string | undefined;
  private readonly tools: Tool[];
  private readonly toolDefinitions: ToolDefinition[];
  private readonly toolRegistry: Map<string, Tool>;
  private readonly maxIterations: number;

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

      this.toolRegistry.set(
        tool.name,
        tool,
      );
    }

    this.toolDefinitions = this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async run(input: string): Promise<ModelOutput> {
    const messages: Message[] = [];

    if (this.instructions) {
      messages.push({
        role: "system",
        content: this.instructions,
      });
    }

    messages.push({
      role: "user",
      content: input,
    });

    for (let iteration = 0; iteration < this.maxIterations; iteration += 1) {
      const output = await this.model.respond({
        messages,
        tools: this.toolDefinitions,
      });

      messages.push({
        role: "assistant",
        content: output.text,
        toolCalls: output.toolCalls,
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
