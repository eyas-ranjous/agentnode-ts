import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentNode,
  type Message,
  type Model,
  type ModelInput,
  type ModelOutput,
  type Tool,
} from "../src/index.js";

class RecordingModel implements Model {
  readonly inputs: ModelInput[] = [];
  private readonly respondToInput: (
    input: ModelInput,
    call: number,
  ) => ModelOutput | Promise<ModelOutput>;

  constructor(
    respondToInput: (
      input: ModelInput,
      call: number,
    ) => ModelOutput | Promise<ModelOutput>,
  ) {
    this.respondToInput = respondToInput;
  }

  async respond(input: ModelInput): Promise<ModelOutput> {
    this.inputs.push(structuredClone(input));
    return this.respondToInput(input, this.inputs.length);
  }
}

test("AgentNode.run preserves conversation history across turns", async () => {
  const model = new RecordingModel((_input, call) => finalOutput(`reply ${call}`));
  const agent = new AgentNode({
    model,
    instructions: "Be concise.",
  });

  await agent.run("My name is Eyas.");
  await agent.run("What is my name?");

  assert.deepEqual(
    model.inputs[1]?.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(model.inputs[1]?.messages[1]?.content, "My name is Eyas.");
  assert.equal(model.inputs[1]?.messages[2]?.content, "reply 1");
  assert.equal(model.inputs[1]?.messages[3]?.content, "What is my name?");
  assert.deepEqual(
    agent.getHistory().map((message) => message.role),
    ["system", "user", "assistant", "user", "assistant"],
  );
});

test("tool calls and results remain in the agent history", async () => {
  const model = new RecordingModel((_input, call) => {
    if (call === 1) {
      return {
        text: "",
        toolCalls: [{
          id: "call-1",
          name: "echo",
          arguments: { value: "hello" },
        }],
      };
    }

    return finalOutput(call === 2 ? "Tool complete." : "Follow-up complete.");
  });
  const echoTool: Tool = {
    name: "echo",
    description: "Returns its input.",
    inputSchema: {
      type: "object",
      properties: {
        value: { type: "string" },
      },
    },
    async execute(input) {
      return input;
    },
  };
  const agent = new AgentNode({
    model,
    tools: [echoTool],
  });

  await agent.run("Use the echo tool.");
  await agent.run("What happened?");

  assert.deepEqual(
    model.inputs[2]?.messages.map((message) => message.role),
    ["user", "assistant", "tool", "assistant", "user"],
  );
  assert.deepEqual(model.inputs[2]?.messages[2], {
    role: "tool",
    toolCallId: "call-1",
    content: "{\"value\":\"hello\"}",
  });
});

test("separate agents have isolated conversation histories", async () => {
  const model = new RecordingModel((_input, call) => finalOutput(`reply ${call}`));
  const firstAgent = new AgentNode({ model });
  const secondAgent = new AgentNode({ model });

  await firstAgent.run("First conversation");
  await secondAgent.run("Second conversation");

  assert.equal(model.inputs[1]?.messages.length, 1);
  assert.equal(model.inputs[1]?.messages[0]?.content, "Second conversation");
});

test("reset clears history and reapplies instructions", async () => {
  const model = new RecordingModel((_input, call) => finalOutput(`reply ${call}`));
  const agent = new AgentNode({
    model,
    instructions: "Be concise.",
  });

  await agent.run("Before reset");
  agent.reset();
  await agent.run("After reset");

  assert.deepEqual(model.inputs[1]?.messages, [
    {
      role: "system",
      content: "Be concise.",
    },
    {
      role: "user",
      content: "After reset",
    },
  ]);
});

test("an agent can restore previous conversation history", async () => {
  const firstModel = new RecordingModel(() => finalOutput("I will remember."));
  const firstAgent = new AgentNode({
    model: firstModel,
    instructions: "Be concise.",
  });

  await firstAgent.run("Remember this.");

  const restoredModel = new RecordingModel(() => finalOutput("I remember."));
  const restoredAgent = new AgentNode({
    model: restoredModel,
    instructions: "Be concise.",
    history: firstAgent.getHistory(),
  });

  await restoredAgent.run("What did I ask you to do?");

  assert.deepEqual(
    restoredModel.inputs[0]?.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(
    restoredModel.inputs[0]?.messages[1]?.content,
    "Remember this.",
  );
});

test("conversation history survives a JSON round trip", async () => {
  const firstModel = new RecordingModel(() => finalOutput("Stored."));
  const firstAgent = new AgentNode({
    model: firstModel,
    instructions: "Be concise.",
  });

  await firstAgent.run("Persist this conversation.");

  const stored = JSON.stringify(firstAgent.getHistory());
  const history = JSON.parse(stored) as Message[];
  const restoredModel = new RecordingModel(() => finalOutput("Restored."));
  const restoredAgent = new AgentNode({
    model: restoredModel,
    instructions: "Be concise.",
    history,
  });

  await restoredAgent.run("Continue the conversation.");

  assert.deepEqual(
    restoredModel.inputs[0]?.messages.map((message) => message.role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(
    restoredModel.inputs[0]?.messages[1]?.content,
    "Persist this conversation.",
  );
});

test("rejects restored history that is not an array", () => {
  const model = new RecordingModel(() => finalOutput("Done."));
  const options = {
    model,
    history: null,
  } as unknown as ConstructorParameters<typeof AgentNode>[0];

  assert.throws(
    () => new AgentNode(options),
    /Agent history must be an array/,
  );
});

test("getHistory returns a defensive copy", async () => {
  const model = new RecordingModel(() => finalOutput("Done."));
  const agent = new AgentNode({ model });

  await agent.run("Keep this.");

  const history = agent.getHistory() as Message[];
  history.length = 0;

  assert.equal(agent.getHistory().length, 2);
});

test("a failed turn does not corrupt agent history", async () => {
  const model = new RecordingModel((_input, call) => {
    if (call === 1) {
      throw new Error("Model unavailable.");
    }

    return finalOutput("Recovered.");
  });
  const agent = new AgentNode({
    model,
    instructions: "Be concise.",
  });

  await assert.rejects(
    agent.run("This turn fails."),
    /Model unavailable/,
  );
  assert.deepEqual(agent.getHistory(), [{
    role: "system",
    content: "Be concise.",
  }]);

  await agent.run("Try again.");
  assert.equal(model.inputs[1]?.messages[1]?.content, "Try again.");
});

test("an agent rejects overlapping runs and resets", async () => {
  let finishResponse: ((output: ModelOutput) => void) | undefined;
  const model = new RecordingModel(() => (
    new Promise<ModelOutput>((resolve) => {
      finishResponse = resolve;
    })
  ));
  const agent = new AgentNode({ model });

  const runningTurn = agent.run("Wait for the response.");

  await assert.rejects(
    agent.run("Start another turn."),
    /already running/,
  );
  assert.throws(
    () => agent.reset(),
    /while it is running/,
  );

  assert.ok(finishResponse);
  finishResponse(finalOutput("Done."));
  await runningTurn;
});

function finalOutput(text: string): ModelOutput {
  return {
    text,
    toolCalls: [],
  };
}
