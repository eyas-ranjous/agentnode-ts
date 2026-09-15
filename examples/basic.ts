import { AgentNode } from "../src/index.js";
import { openai } from "../src/openai.js";

const model = openai("gpt-4.1-mini");

const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
});
const response = await agent.run("Explain what an AI agent is in one sentence.");

console.log(response.text);
