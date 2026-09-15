import { AgentNode } from "../../src/index.js";
import { openai } from "../../src/openai.js";

const model = openai("gpt-4.1-mini");

const agent = new AgentNode({
  model,
  instructions: "You are a helpful assistant.",
});

const stream = await agent.runStream("Tell me a very short story about a robot.");

for await (const chunk of stream) {
  if (chunk.type === "text_delta") {
    process.stdout.write(chunk.delta);
    await new Promise((r) => setTimeout(r, 30));
  }
}

console.log("\n");