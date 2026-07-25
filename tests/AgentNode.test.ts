import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentNode,
  type Model,
  type ModelInput,
  type ModelOutput,
  type Tool,
} from "../src/index.js";

class ScriptedModel implements Model {
  readonly inputs: ModelInput[] = [];
  private readonly responses: ModelOutput[];

  constructor(responses: ModelOutput[]) {
    this.responses = responses;
  }

  async respond(input: ModelInput): Promise<ModelOutput> {
    this.inputs.push(structuredClone(input));

    const response = this.responses.shift();
    if (!response) {
      throw new Error("No scripted model response.");
    }

    return structuredClone(response);
  }
}

test("returns a final model response without tools", async () => {
  const model = new ScriptedModel([
    finalOutput("Hello."),
  ]);
  const agent = new AgentNode({
    model,
    instructions: "Be concise.",
  });

  const output = await agent.run("Say hello.");

  assert.deepEqual(output, finalOutput("Hello."));
  assert.deepEqual(model.inputs[0], {
    messages: [
      {
        role: "system",
        content: "Be concise.",
      },
      {
        role: "user",
        content: "Say hello.",
      },
    ],
    tools: [],
  });
});

test("rejects duplicate tool names", () => {
  const model = new ScriptedModel([]);
  const firstTool = createTool("lookup");
  const secondTool = createTool("lookup");

  assert.throws(
    () => new AgentNode({
      model,
      tools: [firstTool, secondTool],
    }),
    /Duplicate tool: lookup/,
  );
});

test("sends tool definitions without exposing execute functions", async () => {
  const model = new ScriptedModel([
    finalOutput("Done."),
  ]);
  const tool = createTool("lookup");
  const agent = new AgentNode({
    model,
    tools: [tool],
  });

  await agent.run("Use a tool.");

  assert.deepEqual(model.inputs[0]?.tools, [{
    name: "lookup",
    description: "The lookup tool.",
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
  }]);
  assert.equal("execute" in (model.inputs[0]?.tools[0] ?? {}), false);
});

test("executes a requested tool and continues the model loop", async () => {
  const executedInputs: Record<string, unknown>[] = [];
  const tool = createTool("lookup", async (input) => {
    executedInputs.push(input);
    return {
      result: "found",
    };
  });
  const model = new ScriptedModel([
    toolOutput("call-1", "lookup", { value: "query" }),
    finalOutput("The result was found."),
  ]);
  const agent = new AgentNode({
    model,
    tools: [tool],
  });

  const output = await agent.run("Look this up.");

  assert.equal(output.text, "The result was found.");
  assert.deepEqual(executedInputs, [{ value: "query" }]);
  assert.deepEqual(model.inputs[1]?.messages, [
    {
      role: "user",
      content: "Look this up.",
    },
    {
      role: "assistant",
      content: "",
      toolCalls: [{
        id: "call-1",
        name: "lookup",
        arguments: {
          value: "query",
        },
      }],
    },
    {
      role: "tool",
      toolCallId: "call-1",
      content: "{\"result\":\"found\"}",
    },
  ]);
});

test("executes multiple tool calls from one model response", async () => {
  const executionOrder: string[] = [];
  const firstTool = createTool("first", async () => {
    executionOrder.push("first");
    return { value: 1 };
  });
  const secondTool = createTool("second", async () => {
    executionOrder.push("second");
    return { value: 2 };
  });
  const model = new ScriptedModel([
    {
      text: "",
      toolCalls: [
        {
          id: "call-1",
          name: "first",
          arguments: {},
        },
        {
          id: "call-2",
          name: "second",
          arguments: {},
        },
      ],
    },
    finalOutput("Both tools completed."),
  ]);
  const agent = new AgentNode({
    model,
    tools: [firstTool, secondTool],
  });

  await agent.run("Run both tools.");

  assert.deepEqual(executionOrder, ["first", "second"]);
  assert.deepEqual(
    model.inputs[1]?.messages.slice(-2),
    [
      {
        role: "tool",
        toolCallId: "call-1",
        content: "{\"value\":1}",
      },
      {
        role: "tool",
        toolCallId: "call-2",
        content: "{\"value\":2}",
      },
    ],
  );
});

test("rejects calls to tools that are not registered", async () => {
  const model = new ScriptedModel([
    toolOutput("call-1", "missing", {}),
  ]);
  const agent = new AgentNode({ model });

  await assert.rejects(
    agent.run("Use the missing tool."),
    /Tool is not registered: missing/,
  );
});

test("propagates tool execution errors without another model call", async () => {
  const model = new ScriptedModel([
    toolOutput("call-1", "failing", {}),
  ]);
  const failingTool = createTool("failing", async () => {
    throw new Error("Tool failed.");
  });
  const agent = new AgentNode({
    model,
    tools: [failingTool],
  });

  await assert.rejects(
    agent.run("Run the failing tool."),
    /Tool failed/,
  );
  assert.equal(model.inputs.length, 1);
});

test("stops after the configured maximum number of iterations", async () => {
  let executions = 0;
  const loopingTool = createTool("loop", async () => {
    executions += 1;
    return { continue: true };
  });
  const model = new ScriptedModel([
    toolOutput("call-1", "loop", {}),
    toolOutput("call-2", "loop", {}),
  ]);
  const agent = new AgentNode({
    model,
    tools: [loopingTool],
    maxIterations: 2,
  });

  await assert.rejects(
    agent.run("Keep going."),
    /Agent exceeded 2 iterations/,
  );
  assert.equal(model.inputs.length, 2);
  assert.equal(executions, 2);
});

function createTool(
  name: string,
  execute: (
    input: Record<string, unknown>,
  ) => Promise<unknown> = async (input) => input,
): Tool {
  return {
    name,
    description: `The ${name} tool.`,
    inputSchema: {
      type: "object",
      properties: {
        value: {
          type: "string",
        },
      },
      required: ["value"],
      additionalProperties: false,
    },
    execute,
  };
}

function finalOutput(text: string): ModelOutput {
  return {
    text,
    toolCalls: [],
  };
}

function toolOutput(
  id: string,
  name: string,
  arguments_: Record<string, unknown>,
): ModelOutput {
  return {
    text: "",
    toolCalls: [{
      id,
      name,
      arguments: arguments_,
    }],
  };
}
