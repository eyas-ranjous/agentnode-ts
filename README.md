# agentnode-ts

[![npm](https://img.shields.io/npm/v/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)
[![npm](https://img.shields.io/npm/dm/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)

A lightweight AI agent framework for TypeScript.

> [!NOTE]
> **agentnode-ts** is under active development. APIs and capabilities may change
> as the framework evolves.

## Features

- Multi-turn conversations
- Custom tool calling
- Multiple tool calls in one run
- OpenAI support
- Fully typed TypeScript API

## Installation

```bash
npm install agentnode-ts
```

Set your OpenAI API key:

```bash
export OPENAI_API_KEY="your-api-key"
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
  instructions: "You are a concise and helpful assistant.",
});

const response = await agent.run(
  "Explain what an AI agent is in one sentence.",
);

console.log(response.text);
```

## Conversations

An agent remembers earlier messages across calls to `run()`:

```ts
await agent.run(
  "My favorite programming language is TypeScript.",
);

const response = await agent.run(
  "What is my favorite programming language?",
);

console.log(response.text);
```

Use one `AgentNode` per conversation. Start over with:

```ts
agent.reset();
```

You can also continue from existing history:

```ts
const restoredAgent = new AgentNode({
  model,
  history: agent.getHistory(),
});
```

## Tools

Define a tool:

```ts
import type {
  Tool,
} from "agentnode-ts";

const getCurrentTimeTool: Tool = {
  name: "get_current_time",
  description: "Get the current date and time for an IANA time zone.",
  inputSchema: {
    type: "object",
    properties: {
      timeZone: {
        type: "string",
        description: "An IANA time zone such as America/Los_Angeles.",
      },
    },
    required: ["timeZone"],
    additionalProperties: false,
  },

  async execute(input) {
    const timeZone = input.timeZone;
    if (typeof timeZone !== "string") {
      throw new Error("timeZone must be a string.");
    }

    return {
      currentTime: new Intl.DateTimeFormat(
        "en-US",
        {
          dateStyle: "full",
          timeStyle: "long",
          timeZone,
        },
      ).format(new Date()),
    };
  },
};
```

Register the tool and run the agent:

```ts
const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
  tools: [getCurrentTimeTool],
});

const response = await agent.run(
  "What time is it in San Francisco?",
);

console.log(response.text);
```

## Examples

From a cloned repository, install dependencies:

```bash
npm install
```

Run the basic example:

```bash
npx tsx examples/basic.ts
```

Run the conversation example:

```bash
npx tsx examples/conversation/index.ts
```

Run the tool-calling example:

```bash
npx tsx examples/current-time/index.ts
```

## Supported Providers

- OpenAI

## Roadmap

- Context window management
- Streaming responses
- Structured output
- Additional model providers
- Persistent memory
- MCP support
- Multi-step planning

## License

MIT
