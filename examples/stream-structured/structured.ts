import { AgentNode } from "../../src/index.js";
import { openai } from "../../src/openai.js";

const model = openai("gpt-4.1-mini");

const agent = new AgentNode({
  model,
  instructions: "You are a helpful assistant.",
  responseFormat: {
    type: "json_schema",
    name: "weather",
    jsonSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        temperature: { type: "number" },
        condition: { type: "string" },
      },
      required: ["location", "temperature", "condition"],
      additionalProperties: false,
    },
    strict: true,
  },
});

const response = await agent.run("What's the weather like in Tokyo right now?");

console.log(response.text);