# agentnode-ts

[![npm](https://img.shields.io/npm/v/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)
[![npm](https://img.shields.io/npm/dm/agentnode-ts.svg)](https://www.npmjs.com/package/agentnode-ts)

A lightweight AI agent framework for TypeScript. Connect a model, give it tools,
and keep a conversation going across calls. Supports streaming, JSON schema
output, and configurable context budgets, with a built-in OpenAI adapter.

> [!NOTE]
> Under active development. APIs and capabilities may change.

[Quick start](#quick-start) · [Tools](#tools) · [Conversations](#conversations) ·
[Output](#output) · [Context window](#context-window) · [Examples](#examples)

## Quick start

Requires Node.js 20 or later.

```bash
npm install agentnode-ts
export OPENAI_API_KEY="your-api-key"
```

```ts
import { AgentNode, OpenAIModel } from "agentnode-ts";

const model = new OpenAIModel({ model: "gpt-4.1-mini" });
const agent = new AgentNode({
  model,
  instructions: "You are a concise and helpful assistant.",
});

const response = await agent.run("Explain what an AI agent is in one sentence.");
console.log(response.text);
```

`run()` sends the conversation to the model, executes any requested tools, and
feeds their results back until the model responds without tool calls. Each
successful run saves the conversation in memory.

The examples below reuse `model` or `agent` from this setup.

## Tools

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

An agent can execute multiple tool calls in a run. `maxIterations` limits model
calls per run and defaults to `10`; reaching the limit throws an error.

## Conversations

Use one `AgentNode` per conversation. Calls to `run()` include previous messages:

```ts
await agent.run("My favorite color is blue.");
const response = await agent.run("What is my favorite color?");
console.log(response.text);
```

`getHistory()` returns a copy of the full history, including tool calls and
results. Pass it to a new agent to continue the conversation:

```ts
const restoredAgent = new AgentNode({
  model,
  history: agent.getHistory(),
});

await restoredAgent.run("What fact did I share with you?");
```

Supplied `history` becomes the initial conversation, including its system
messages. `reset()` clears the conversation and restores the constructor's
`instructions`, if provided:

```ts
agent.reset();
```

History is kept in memory. A failed `run()` leaves saved history unchanged, though
any tools already executed may have external effects.

## Output

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

## Context window

Set an input token budget to limit how much history the model receives:

```ts
const budgetedAgent = new AgentNode({
  model,
  contextWindow: { maxInputTokens: 8_000 },
});
```

Before each model call, including tool-loop iterations and streaming, the agent
removes the oldest complete turns until the request fits. It keeps system
messages and the entire current user turn, including tool calls and results.
If those messages and request definitions cannot fit, it throws before calling
the model.

Trimming only affects model input. `getHistory()` still returns the full
conversation, so this does not limit memory usage. Without `contextWindow`, the
agent sends all history.

The default token estimate includes messages, tools, and the response schema,
plus a 20% safety margin. It is approximate and can underestimate some inputs.
Leave room for output and estimation error when choosing `maxInputTokens`; this
option does not set the provider's output-token limit.

<details>
<summary>Customize token counting</summary>

Use the exported estimator with a different safety margin, or supply your own
counter using the model's tokenizer and request format:

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

`countTokens` receives a copy of the candidate `ModelInput` and must return a
non-negative safe integer. Include the whole request, including tool definitions,
the response schema, and provider overhead.

`estimateTokens` uses four ASCII characters per token and one token per non-ASCII
UTF-8 byte. It adds framing allowances of 4 tokens per message or tool call, 8 per
definition, and 3 per request before applying the safety margin. These heuristics
can overcount Unicode text and underestimate ASCII code or unusual strings; they
are not a guaranteed upper bound.

`safetyMargin` accepts values from `0` to `1`: `0` disables padding, `0.3` adds
30%, and `1` doubles the estimate.

</details>

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
