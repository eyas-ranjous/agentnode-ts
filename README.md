# agentnode-ts

[![npm](https://img.shields.io/npm/v/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)
[![npm](https://img.shields.io/npm/dm/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)

A lightweight AI agent framework for TypeScript.

## Features

- 🤖 Provider-independent `Model` interface
- 🔄 Automatic execution loop
- 🛠️ Tool registration and execution
- 🔁 Multiple tool calls per iteration
- 🧩 Designed for multiple language model providers
- 📦 Fully typed TypeScript API

## Installation

```bash
npm install agentnode-ts
```

## Quick Start

```ts
import {
  AgentNode,
  OpenAIModel,
} from "agentnode-ts";

const model = new OpenAIModel({
  model: "gpt-4.1-mini",
});

const agent = new AgentNode({
  model,
  instructions: "You are a helpful assistant.",
});

const response = await agent.run(
  "Explain what an AI agent is."
);

console.log(response.text);
```

## Defining a Tool

```ts
import type { Tool } from "agentnode-ts";

export const getCurrentTimeTool: Tool = {
  name: "get_current_time",

  description: "Returns the current time for a given time zone.",

  inputSchema: {
    type: "object",
    properties: {
      timeZone: {
        type: "string",
      },
    },
    required: ["timeZone"],
  },

  async execute(input) {
    return {
      time: new Date().toISOString(),
    };
  },
};
```

Register the tool when creating the agent.

```ts
const agent = new AgentNode({
  model,
  tools: [getCurrentTimeTool],
});
```

The framework automatically:

- sends tool definitions to the language model
- executes requested tools
- updates the conversation context
- continues the execution loop until a final response is produced

## Examples

Run the basic example:

```bash
npx tsx examples/basic.ts
```

Run the tool-calling example:

```bash
npx tsx examples/current-time/index.ts
```

## Supported Providers

Current:
- OpenAI

## Roadmap

This framework is under development. Some of the planned features include:

- Streaming responses
- Memory
- MCP support
- Structured output
- Multi-step planning
- Additional model providers

## License

MIT
