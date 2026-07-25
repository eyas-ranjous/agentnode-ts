import type {
  Message,
  ModelOutput,
} from "../models/Model.js";

import type {
  AgentSession,
} from "./AgentSession.js";

export type InMemoryAgentSessionOptions = {
  history: Message[];
  baseHistory: Message[];
  run: (history: Message[]) => Promise<ModelOutput>;
};

export class InMemoryAgentSession implements AgentSession {
  private history: Message[];
  private readonly baseHistory: Message[];
  private readonly runAgent: (history: Message[]) => Promise<ModelOutput>;
  private running = false;

  constructor(options: InMemoryAgentSessionOptions) {
    this.history = cloneHistory(options.history);
    this.baseHistory = cloneHistory(options.baseHistory);
    this.runAgent = options.run;
  }

  async run(input: string): Promise<ModelOutput> {
    if (this.running) {
      throw new Error("Agent is already running.");
    }

    this.running = true;
    const nextHistory = cloneHistory(this.history);
    nextHistory.push({
      role: "user",
      content: input,
    });

    try {
      const output = await this.runAgent(nextHistory);
      this.history = nextHistory;
      return output;
    } finally {
      this.running = false;
    }
  }

  getHistory(): readonly Message[] {
    return cloneHistory(this.history);
  }

  reset(): void {
    if (this.running) {
      throw new Error("Cannot reset the agent while it is running.");
    }

    this.history = cloneHistory(this.baseHistory);
  }
}

function cloneHistory(history: readonly Message[]): Message[] {
  return structuredClone([...history]);
}
