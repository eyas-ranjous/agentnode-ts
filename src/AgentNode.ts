import type {
  Message,
  Model,
  ModelResponse,
} from "./models/Model.js";

export type AgentNodeOptions = {
  model: Model;
  instructions?: string | undefined;
};

export class AgentNode {
  private readonly model: Model;
  private readonly instructions?: string | undefined;

  constructor(options: AgentNodeOptions) {
    this.model = options.model;
    this.instructions = options.instructions;
  }

  async run(input: string): Promise<ModelResponse> {
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

    return this.model.respond(messages);
  }
}
