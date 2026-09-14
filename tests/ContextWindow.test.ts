import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentNode,
  type Message,
  type Model,
  type ModelInput,
  type ModelOutput,
  type StreamChunk,
  type Tool,
} from "../src/index.js";

const done: ModelOutput = { text: "Done", toolCalls: [] };
const oldHistory: Message[] = [
  { role: "system", content: "Keep this instruction" },
  { role: "user", content: "Old question" },
  { role: "assistant", content: "Old answer", toolCalls: [] },
  { role: "user", content: "Recent question" },
  { role: "assistant", content: "Recent answer", toolCalls: [] },
];
const countMessages = (input: ModelInput) => input.messages.length;

class RecordingModel implements Model {
  inputs: ModelInput[] = [];
  constructor(private outputs: ModelOutput[] = []) {}
  async respond(input: ModelInput): Promise<ModelOutput> {
    this.inputs.push(structuredClone(input));
    return this.outputs.shift() ?? done;
  }
  async *respondStream(input: ModelInput): AsyncIterable<StreamChunk> {
    this.inputs.push(structuredClone(input));
    yield { type: "text_delta", delta: "Done" };
  }
}

test("keeps newest complete turns at the budget boundary without losing history", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    history: oldHistory,
    contextWindow: { maxInputTokens: 4, countTokens: countMessages },
  });
  await agent.run("Current question");
  assert.deepEqual(model.inputs[0]?.messages, [
    oldHistory[0], oldHistory[3], oldHistory[4],
    { role: "user", content: "Current question" },
  ]);
  assert.deepEqual(agent.getHistory().slice(0, 5), oldHistory);
  assert.equal(agent.getHistory().length, 7);
  assert.equal(oldHistory.length, 5);
});

test("removes multiple old turns and retains system messages in their order", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    history: [...oldHistory, { role: "system", content: "Another instruction" }],
    contextWindow: { maxInputTokens: 3, countTokens: countMessages },
  });
  await agent.run("Current");
  assert.deepEqual(model.inputs[0]?.messages, [
    oldHistory[0], { role: "system", content: "Another instruction" },
    { role: "user", content: "Current" },
  ]);
});

const calls = [
  { id: "a", name: "lookup", arguments: {} },
  { id: "b", name: "lookup", arguments: {} },
];
const lookup: Tool = {
  name: "lookup",
  description: "Look up a value",
  inputSchema: { type: "object", properties: {} },
  execute: async () => "value",
};

test("rechecks after tools and never splits a turn's multiple calls and results", async () => {
  const model = new RecordingModel([{ text: "", toolCalls: calls }, done]);
  const agent = new AgentNode({
    model,
    tools: [lookup],
    history: oldHistory,
    contextWindow: { maxInputTokens: 6, countTokens: countMessages },
  });
  await agent.run("Use tools");
  assert.equal(model.inputs[0]?.messages.length, 6);
  assert.deepEqual(model.inputs[1]?.messages.map((message) => message.role), [
    "system", "user", "assistant", "tool", "tool",
  ]);
  await agent.run("Next question");
  assert.deepEqual(model.inputs[2]?.messages, [
    oldHistory[0], { role: "user", content: "Next question" },
  ]);
  assert.equal(agent.getHistory().length, 12);
});

test("overflow after tool execution rolls back history without a second model call", async () => {
  const model = new RecordingModel([{ text: "", toolCalls: calls }]);
  const agent = new AgentNode({
    model,
    history: oldHistory,
    tools: [lookup],
    contextWindow: { maxInputTokens: 4, countTokens: countMessages },
  });
  await assert.rejects(agent.run("Use tools"), /Context window exceeded/);
  assert.equal(model.inputs.length, 1);
  assert.deepEqual(agent.getHistory(), oldHistory);
  await agent.run("Try again");
  assert.equal(model.inputs.length, 2);
});

test("counts tools and response schemas and rejects oversized input before calling the model", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    tools: [lookup],
    responseFormat: { type: "json_schema", name: "result", jsonSchema: { type: "object" } },
    contextWindow: {
      maxInputTokens: 2,
      countTokens: (input) => {
        assert.equal(input.tools[0]?.name, "lookup");
        assert.equal(input.responseFormat?.name, "result");
        return input.messages.length + input.tools.length + (input.responseFormat ? 1 : 0);
      },
    },
  });
  await assert.rejects(agent.run("Hello"), /Context window exceeded: 3 input tokens, limit 2/);
  assert.equal(model.inputs.length, 0);
  assert.deepEqual(agent.getHistory(), []);
});

test("streaming uses the same budget and leaves history unchanged", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    history: oldHistory,
    contextWindow: { maxInputTokens: 2, countTokens: countMessages },
  });
  const chunks = [];
  for await (const chunk of agent.runStream("Current")) chunks.push(chunk);
  assert.equal(chunks.length, 1);
  assert.deepEqual(model.inputs[0]?.messages, [oldHistory[0], { role: "user", content: "Current" }]);
  assert.deepEqual(agent.getHistory(), oldHistory);
});

test("streaming rejects overflow before calling the model", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    instructions: "Keep me",
    contextWindow: { maxInputTokens: 1, countTokens: countMessages },
  });
  await assert.rejects(async () => {
    for await (const chunk of agent.runStream("Hello")) assert.fail(JSON.stringify(chunk));
  }, /Context window exceeded/);
  assert.equal(model.inputs.length, 0);
});

test("default estimate trims long history and rejects an oversized current turn", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    history: [
      { role: "user", content: "x".repeat(1000) },
      { role: "assistant", content: "Done", toolCalls: [] },
    ],
    contextWindow: { maxInputTokens: 100 },
  });
  await agent.run("Hi");
  assert.deepEqual(model.inputs[0]?.messages, [{ role: "user", content: "Hi" }]);
  const history = agent.getHistory();
  await assert.rejects(agent.run("x".repeat(1000)), /Context window exceeded/);
  assert.deepEqual(agent.getHistory(), history);
});

test("rejects invalid budgets and token counts", async () => {
  const model = new RecordingModel();
  for (const maxInputTokens of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => new AgentNode({ model, contextWindow: { maxInputTokens } }), /positive safe integer/);
  }
  for (const tokens of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const agent = new AgentNode({
      model,
      contextWindow: { maxInputTokens: 10, countTokens: () => tokens },
    });
    await assert.rejects(agent.run("Hi"), /non-negative safe integer/);
    assert.deepEqual(agent.getHistory(), []);
  }
});

test("reset still reapplies instructions after trimming", async () => {
  const model = new RecordingModel();
  const agent = new AgentNode({
    model,
    instructions: "Base instruction",
    history: oldHistory,
    contextWindow: { maxInputTokens: 2, countTokens: countMessages },
  });
  await agent.run("First");
  agent.reset();
  await agent.run("Second");
  assert.deepEqual(model.inputs[1]?.messages, [
    { role: "system", content: "Base instruction" },
    { role: "user", content: "Second" },
  ]);
});
