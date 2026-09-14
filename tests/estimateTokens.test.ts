import assert from "node:assert/strict";
import test from "node:test";
import { AgentNode, estimateTokens, type ModelInput, type ToolDefinition } from "../src/index.js";

function request(content: string): ModelInput {
  return { messages: [{ role: "user", content }], tools: [] };
}

test("returns positive integer estimates for empty, prose, code, and Unicode input", () => {
  const samples = ["", "Hello, how are you?", "const sum = (a, b) => a + b;", "مرحبا بالعالم", "你好世界", "👩🏽‍💻", "e\u0301", "\ud800"];
  for (const content of samples) {
    const input = request(content);
    const original = structuredClone(input);
    const estimate = estimateTokens(input);
    assert.ok(Number.isSafeInteger(estimate) && estimate > 0);
    assert.deepEqual(input, original);
  }
});

test("reserves more space for multibyte text than equally long ASCII text", () => {
  for (const content of ["你".repeat(100), "ش".repeat(100), "🙂".repeat(100)]) {
    assert.ok(estimateTokens(request(content)) > estimateTokens(request("a".repeat(content.length))));
  }
});

test("accounts for message boundaries independently of content", () => {
  const single = estimateTokens(request("hello world"));
  const split = estimateTokens({
    messages: [{ role: "user", content: "hello " }, { role: "user", content: "world" }],
    tools: [],
  });
  assert.ok(split > single);
});

test("includes tool definitions and response schemas", () => {
  const input = request("Hi");
  const baseline = estimateTokens(input);
  const tool: ToolDefinition = {
    name: "search",
    description: "Search documents",
    inputSchema: { type: "object", properties: {} },
  };
  input.tools.push(tool);
  const withTool = estimateTokens(input);
  assert.ok(withTool > baseline);
  tool.inputSchema.properties.query = { type: "string", description: "search query ".repeat(100) };
  assert.ok(estimateTokens(input) > withTool);
  const withSchema = estimateTokens(input);
  input.responseFormat = { type: "json_schema", name: "answer", jsonSchema: { type: "object" } };
  assert.ok(estimateTokens(input) > withSchema);
});

test("includes tool calls, arguments, IDs, and results", () => {
  const input = request("Search");
  const baseline = estimateTokens(input);
  const call = { id: "call-1", name: "search", arguments: { query: "example" } };
  input.messages.push({ role: "assistant", content: "", toolCalls: [call] });
  const withCall = estimateTokens(input);
  assert.ok(withCall > baseline);
  call.arguments.query = "long query ".repeat(100);
  assert.ok(estimateTokens(input) > withCall);
  const withArguments = estimateTokens(input);
  call.id = "id".repeat(100);
  assert.ok(estimateTokens(input) > withArguments);
  const withId = estimateTokens(input);
  input.messages.push({ role: "tool", toolCallId: call.id, content: "result ".repeat(100) });
  assert.ok(estimateTokens(input) > withId);
});

test("supports zero and custom safety margins", () => {
  const input = request("Hello".repeat(100));
  const baseline = estimateTokens(input, { safetyMargin: 0 });
  assert.equal(estimateTokens(input), Math.ceil(baseline * 1.2));
  assert.equal(estimateTokens(input, { safetyMargin: 0.5 }), Math.ceil(baseline * 1.5));
  assert.equal(estimateTokens(input, { safetyMargin: 1 }), baseline * 2);
  for (const safetyMargin of [-1, 1.01, NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    assert.throws(() => estimateTokens(input, { safetyMargin }), /safetyMargin/);
  }
});

test("context windows use the public estimate and allow a custom margin", async () => {
  const input = request("Hello");
  const maxInputTokens = estimateTokens(input);
  let calls = 0;
  const model = { respond: async () => { calls += 1; return { text: "Done", toolCalls: [] }; } };
  await new AgentNode({ model, contextWindow: { maxInputTokens } }).run("Hello");
  await assert.rejects(new AgentNode({ model, contextWindow: {
    maxInputTokens,
    countTokens: (request) => estimateTokens(request, { safetyMargin: 1 }),
  } }).run("Hello"), /Context window exceeded/);
  assert.equal(calls, 1);
});
