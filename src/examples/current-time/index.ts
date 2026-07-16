import {
  AgentNode,
  OpenAIModel,
} from "../../index";

import {
  getCurrentTimeTool,
} from "./getCurrentTimeTool.js";

const model = new OpenAIModel({
  model: "gpt-4.1-mini",
});

const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
  tools: [getCurrentTimeTool],
});

const response = await agent.run(
  "What time is it in San Francisco?",
);

console.log(response.text);
