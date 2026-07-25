import type {
  Message,
  ModelOutput,
} from "../models/Model.js";

export interface AgentSession {
  run(input: string): Promise<ModelOutput>;
  getHistory(): readonly Message[];
  reset(): void;
}
