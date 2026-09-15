# agentnode-ts

[![npm](https://img.shields.io/npm/v/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)
[![npm](https://img.shields.io/npm/dm/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)

A lightweight TypeScript agent framework with tools, conversation history,
streaming, structured output, and context budgets. Includes an OpenAI adapter.

> [!NOTE]
> Under active development. APIs and capabilities may change.

[Quick start](#quick-start) · [Usage](#usage) · [Examples](#examples) · [Roadmap](#roadmap)

## Quick start

Requires Node.js 20 or later. This example uses OpenAI.

```bash
npm install agentnode-ts openai
export OPENAI_API_KEY="your-api-key"
```

Install `openai` only if you use the OpenAI adapter. It reads `OPENAI_API_KEY`
by default, or accepts a key through `openai(modelName, { apiKey })`.
For other providers, pass an adapter that implements the framework's `Model` interface.

```ts
import { AgentNode } from "agentnode-ts";
import { openai } from "agentnode-ts/openai";

const model = openai("gpt-4.1-mini");
const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
});

const response = await agent.run("Explain what an AI agent is in one sentence.");
console.log(response.text);
```

`run()` executes requested tools and feeds results back until the model finishes.
Successful runs save the conversation in memory.

## Usage

The examples below reuse `model` or `agent` from the quick start.

- [Conversations](#conversations): continue, restore, or reset a conversation.
- [Context window](#context-window): keep model input within a token budget.
- [Tools](#tools): let the agent call your functions.
- [Streaming text](#streaming-text): display a response as it arrives.
- [Structured JSON](#structured-json): request output matching a schema.

### Conversations

Use one `AgentNode` per conversation. Calls to `run()` include previous messages:

```ts
await agent.run("My favorite color is blue.");
const response = await agent.run("What is my favorite color?");
console.log(response.text);
```

#### Restore a conversation

Pass a copy of the full history, including tool calls and results, to a new agent:

```ts
const restoredAgent = new AgentNode({
  model,
  history: agent.getHistory(),
});

await restoredAgent.run("What fact did I share with you?");
```

Supplied `history` becomes the initial conversation, including its system
messages.

#### Reset a conversation

`reset()` clears the conversation and restores the constructor's `instructions`,
if provided:

```ts
agent.reset();
```

A failed `run()` leaves saved history unchanged, but does not undo executed tools.

### Context window

Set an input token budget to limit how much history the model receives:

```ts
const budgetedAgent = new AgentNode({
  model,
  contextWindow: { maxInputTokens: 8_000 },
});
```

Before each model call, including streaming, the agent drops oldest complete turns
to fit the budget. System messages and the current turn, including tool calls and
results, are retained. If these and request definitions exceed the budget, it throws.

Trimming leaves saved history intact and does not limit memory usage.
Without `contextWindow`, all history is sent.

The default estimate includes the whole request plus a 20% safety margin, but can
underestimate. Leave room for output and estimation error; `maxInputTokens` does
not set the provider's output limit.

#### Customize token counting

Adjust the safety margin or supply your own token counter:

```ts
import { estimateTokens } from "agentnode-ts";

const budgetedAgent = new AgentNode({
  model,
  contextWindow: {
    maxInputTokens: 8_000,
    countTokens: (input) => estimateTokens(input, { safetyMargin: 0.3 }),
  },
});
```

`countTokens` receives a copy of `ModelInput` and must return a non-negative safe
integer covering messages, tool definitions, the response schema, and provider overhead.

`estimateTokens` approximates ASCII text and conservatively counts non-ASCII bytes,
then adds framing overhead and the safety margin. It is not an exact tokenizer.

`safetyMargin` accepts values from `0` to `1`: `0` disables padding, `0.3` adds
30%, and `1` doubles the estimate.

### Tools

A tool pairs a JSON input schema with an `execute` function. Validate arguments
inside `execute` and return a JSON-serializable result.

```ts
import type { Tool } from "agentnode-ts";

const getCurrentTime: Tool = {
  name: "get_current_time",
  description: "Get the current date and time for an IANA time zone.",
  inputSchema: {
    type: "object",
    properties: {
      timeZone: { type: "string", description: "For example, America/Los_Angeles." },
    },
    required: ["timeZone"],
    additionalProperties: false,
  },
  async execute(input) {
    if (typeof input.timeZone !== "string") {
      throw new Error("timeZone must be a string.");
    }

    return {
      currentTime: new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone: input.timeZone,
      }).format(new Date()),
    };
  },
};

const timeAgent = new AgentNode({
  model,
  tools: [getCurrentTime],
});

const response = await timeAgent.run("What time is it in San Francisco?");
console.log(response.text);
```

`maxIterations` caps model calls per run (default: `10`). If the model has not
finished by then, the run throws.

### Streaming text

```ts
const stream = agent.runStream("Tell me a short story.");

for await (const chunk of stream) {
  if (chunk.type === "text_delta") {
    process.stdout.write(chunk.delta);
  }
}
```

Streaming uses the existing conversation but currently returns only the first
model response. It does not execute tools or save the streamed turn to history.
The model adapter must support streaming.

### Structured JSON

Use `responseFormat` to request output matching a JSON schema. The response is
returned as a JSON string in `response.text`.

```ts
const extractionAgent = new AgentNode({
  model,
  responseFormat: {
    type: "json_schema",
    name: "person",
    jsonSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        city: { type: "string" },
      },
      required: ["name", "city"],
      additionalProperties: false,
    },
    strict: true,
  },
});

const response = await extractionAgent.run("Extract the person: Ada lives in London.");
console.log(JSON.parse(response.text));
```

## Examples

From a cloned repository, run `npm install` and set `OPENAI_API_KEY`. Run an
example with `npx tsx <path>`:

| Example | Path |
| --- | --- |
| Basic response | [examples/basic.ts](examples/basic.ts) |
| Conversation history | [examples/conversation/index.ts](examples/conversation/index.ts) |
| Tool calling | [examples/current-time/index.ts](examples/current-time/index.ts) |
| Streaming | [examples/stream-structured/stream.ts](examples/stream-structured/stream.ts) |
| Structured output | [examples/stream-structured/structured.ts](examples/stream-structured/structured.ts) |

## Roadmap

- Cancellation and timeouts
- Lifecycle events for model calls, tool execution, and run completion
- Streaming with tool execution and conversation history
- A second model provider to validate the shared interfaces
- Tool execution controls to approve, reject, or modify calls
- Token usage reporting and per-run budgets
- MCP support
- Pluggable conversation storage across restarts
- Advanced context strategies (summarization and token-aware compaction)
- Optional multi-step planning

## License

MIT
