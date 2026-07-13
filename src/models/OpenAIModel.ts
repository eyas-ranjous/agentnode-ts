import OpenAI from "openai";

import type {
  Message,
  Model,
  ModelResponse,
} from "./Model.js";

export type OpenAIModelOptions = {
  model: string;
  apiKey?: string;
};

export class OpenAIModel implements Model {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIModelOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
    });

    this.model = options.model;
  }

  async respond(messages: Message[]): Promise<ModelResponse> {
    const response = await this.client.responses.create({
      model: this.model,
      input: messages,
    });

    return {
      text: response.output_text,
    };
  }
}
