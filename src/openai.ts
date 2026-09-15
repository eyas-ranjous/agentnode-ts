import { OpenAIModel, type OpenAIModelOptions } from "./models/OpenAIModel.js";

export { OpenAIModel, type OpenAIModelOptions } from "./models/OpenAIModel.js";

export function openai(model: string, options: Omit<OpenAIModelOptions, "model"> = {}): OpenAIModel {
  return new OpenAIModel({ ...options, model });
}
