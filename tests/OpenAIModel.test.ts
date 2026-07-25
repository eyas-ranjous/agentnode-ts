import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenAIModel,
  type ModelInput,
} from "../src/index.js";

test("translates normalized messages and tools to an OpenAI request", async () => {
  const mock = mockOpenAIResponse({
    output: [{
      type: "message",
      id: "message-1",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text: "Final response.",
        annotations: [],
        logprobs: [],
      }],
    }],
    output_text: "",
  });
  const model = new OpenAIModel({
    model: "test-model",
    apiKey: "test-key",
  });
  const input: ModelInput = {
    messages: [
      {
        role: "system",
        content: "Be concise.",
      },
      {
        role: "user",
        content: "Look this up.",
      },
      {
        role: "assistant",
        content: "I will use a tool.",
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
    ],
    tools: [{
      name: "lookup",
      description: "Looks up a value.",
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
    }],
  };

  try {
    const output = await model.respond(input);

    assert.deepEqual(output, {
      text: "Final response.",
      toolCalls: [],
    });
    assert.deepEqual(mock.requestBody(), {
      model: "test-model",
      input: [
        {
          role: "system",
          content: "Be concise.",
        },
        {
          role: "user",
          content: "Look this up.",
        },
        {
          role: "assistant",
          content: "I will use a tool.",
        },
        {
          type: "function_call",
          call_id: "call-1",
          name: "lookup",
          arguments: "{\"value\":\"query\"}",
        },
        {
          type: "function_call_output",
          call_id: "call-1",
          output: "{\"result\":\"found\"}",
        },
      ],
      tools: [{
        type: "function",
        name: "lookup",
        description: "Looks up a value.",
        parameters: {
          type: "object",
          properties: {
            value: {
              type: "string",
            },
          },
          required: ["value"],
          additionalProperties: false,
        },
        strict: false,
      }],
    });
  } finally {
    mock.restore();
  }
});

test("normalizes OpenAI function calls", async () => {
  const mock = mockOpenAIResponse({
    output: [{
      type: "function_call",
      id: "item-1",
      call_id: "call-1",
      name: "lookup",
      arguments: "{\"value\":\"query\"}",
      status: "completed",
    }],
    output_text: "",
  });
  const model = new OpenAIModel({
    model: "test-model",
    apiKey: "test-key",
  });

  try {
    const output = await model.respond({
      messages: [{
        role: "user",
        content: "Look this up.",
      }],
      tools: [],
    });

    assert.deepEqual(output, {
      text: "",
      toolCalls: [{
        id: "call-1",
        name: "lookup",
        arguments: {
          value: "query",
        },
      }],
    });
  } finally {
    mock.restore();
  }
});

test("rejects function-call arguments that are not JSON objects", async () => {
  const mock = mockOpenAIResponse({
    output: [{
      type: "function_call",
      id: "item-1",
      call_id: "call-1",
      name: "lookup",
      arguments: "[\"query\"]",
      status: "completed",
    }],
    output_text: "",
  });
  const model = new OpenAIModel({
    model: "test-model",
    apiKey: "test-key",
  });

  try {
    await assert.rejects(
      model.respond({
        messages: [{
          role: "user",
          content: "Look this up.",
        }],
        tools: [],
      }),
      /Tool arguments must be a JSON object/,
    );
  } finally {
    mock.restore();
  }
});

type OpenAIResponse = {
  output: unknown[];
  output_text: string;
};

function mockOpenAIResponse(response: OpenAIResponse): {
  requestBody: () => unknown;
  restore: () => void;
} {
  const originalFetch = globalThis.fetch;
  let body: unknown;

  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request
      ? input
      : new Request(input, init);
    body = JSON.parse(await request.clone().text());

    return new Response(
      JSON.stringify({
        id: "resp-test",
        object: "response",
        created_at: 0,
        status: "completed",
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        model: "test-model",
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: null,
        store: false,
        temperature: 1,
        text: {
          format: {
            type: "text",
          },
        },
        tool_choice: "auto",
        tools: [],
        top_p: 1,
        truncation: "disabled",
        usage: null,
        ...response,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  };

  return {
    requestBody: () => body,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
