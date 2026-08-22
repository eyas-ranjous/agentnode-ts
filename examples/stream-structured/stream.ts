import {
  AgentNode,
  OpenAIModel,
} from "../../src/index.js";

const model = new OpenAIModel({
  model: "gpt-4.1-mini",
});

const agent = new AgentNode({
  model,
  instructions: "You are a helpful assistant.",
});

const stream = await agent.runStream("Tell me a very short story about a robot.");

for await (const chunk of stream) {
  if (chunk.type === "text_delta") {
    process.stdout.write(chunk.delta);
  }
}

console.log("\n");