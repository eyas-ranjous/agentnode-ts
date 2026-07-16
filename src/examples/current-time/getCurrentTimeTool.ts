import type {
  Tool,
} from "../../index";

export const getCurrentTimeTool: Tool = {
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
  async execute(input: any) {
    const timeZone = input.timeZone;
    if (typeof timeZone !== "string") {
      throw new Error("timeZone must be a string.");
    }
    return {
      timeZone,
      currentTime:
        new Intl.DateTimeFormat(
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
