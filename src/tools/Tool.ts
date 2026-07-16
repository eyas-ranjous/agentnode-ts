export type ToolInputSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
};

export interface Tool extends ToolDefinition {
  execute(input: Record<string, unknown>): Promise<unknown>;
}
