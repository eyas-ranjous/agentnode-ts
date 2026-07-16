import {
  AgentNode,
  OpenAIModel,
} from "../index.js";

const model = new OpenAIModel({
  model: "gpt-4.1-mini",
});

const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
});

const response = await agent.run(
  "Explain what an AI agent is in one sentence.",
);

console.log(response.text);
