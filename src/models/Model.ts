export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelResponse = {
  text: string;
};

export interface Model {
  respond(messages: Message[]): Promise<ModelResponse>;
}
