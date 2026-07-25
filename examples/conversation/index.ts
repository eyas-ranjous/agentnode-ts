import {
  AgentNode,
  OpenAIModel,
} from "../../src/index.js";

const model = new OpenAIModel({
  model: "gpt-4.1-mini",
});

const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
});

const firstResponse = await agent.run(
  "My favorite color is blue.",
);
console.log(firstResponse.text);

const secondResponse = await agent.run(
  "What is my favorite color?",
);
console.log(secondResponse.text);

const history = agent.getHistory();
const restoredAgent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
  history,
});

const restoredResponse = await restoredAgent.run(
  "What fact did I share with you?",
);
console.log(restoredResponse.text);
