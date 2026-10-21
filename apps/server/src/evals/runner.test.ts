import { describe, expect, it, vi } from "vitest";

import { type LiveMessage, type LiveSessionLike, runConversation } from "@/evals/runner";

type Script = (text: string, emit: (message: LiveMessage) => void) => void;

// A fake Live session: `script` decides how "the model" answers each text turn and tool response.
function fakeOpen(script: Script, onToolResponse?: (emit: (message: LiveMessage) => void) => void) {
  const sent: string[] = [];
  const toolResponses: unknown[] = [];
  const open = async (onMessage: (message: LiveMessage) => void): Promise<LiveSessionLike> => {
    const emit = (message: LiveMessage) => setTimeout(() => onMessage(message), 0);
    return {
      sendClientContent: ({ turns }) => {
        const text = turns[0]?.parts[0]?.text ?? "";
        sent.push(text);
        script(text, emit);
      },
      sendToolResponse: (response) => {
        toolResponses.push(response);
        onToolResponse?.(emit);
      },
      close: vi.fn(),
    };
  };
  return { open, sent, toolResponses };
}

const say = (text: string): LiveMessage => ({ serverContent: { outputTranscription: { text } } });
const done: LiveMessage = { serverContent: { turnComplete: true } };

describe("runConversation", () => {
  it("greets, sends typed customer turns and collects Aria's replies", async () => {
    const fake = fakeOpen((text, emit) => {
      emit(say(text.includes("joined") ? "Hi, this is Aria." : "Sure, which order?"));
      emit(done);
    });
    const result = await runConversation(["Where is my order?"], { open: fake.open, callTool: vi.fn() });

    expect(fake.sent).toEqual([expect.stringContaining("joined"), "Customer (typed): Where is my order?"]);
    expect(result.agentText).toBe("Hi, this is Aria. Sure, which order?");
    expect(result.transcript).toEqual(["Aria: Hi, this is Aria.", "Customer: Where is my order?", "Aria: Sure, which order?"]);
  });

  it("runs tool calls and waits for the reply that follows the tool result", async () => {
    const fake = fakeOpen(
      (text, emit) => {
        if (text.includes("joined")) {
          emit(say("Hi."));
          emit(done);
          return;
        }
        emit({ toolCall: { functionCalls: [{ id: "c1", name: "get_order_details", args: { order_id: "ORD-101" } }] } });
        emit(done);
      },
      (emit) => {
        emit(say("It arrives by 6 PM."));
        emit(done);
      },
    );
    const callTool = vi.fn(async () => ({ found: true }));
    const result = await runConversation(["Where is ORD-101?"], { open: fake.open, callTool });

    expect(callTool).toHaveBeenCalledWith("get_order_details", { order_id: "ORD-101" });
    expect(fake.toolResponses).toEqual([
      { functionResponses: [{ id: "c1", name: "get_order_details", response: { output: { found: true } } }] },
    ]);
    expect(result.toolCalls).toEqual([{ name: "get_order_details", args: { order_id: "ORD-101" }, result: { found: true } }]);
    expect(result.agentText).toBe("Hi. It arrives by 6 PM.");
  });

  it("passes tool errors back to the model", async () => {
    const fake = fakeOpen(
      (text, emit) => {
        if (text.includes("joined")) return (emit(say("Hi.")), emit(done));
        emit({ toolCall: { functionCalls: [{ id: "c1", name: "get_order_details", args: {} }] } });
      },
      (emit) => (emit(say("Sorry.")), emit(done)),
    );
    const callTool = vi.fn(async () => {
      throw new Error("down");
    });
    await runConversation(["Where is it?"], { open: fake.open, callTool });
    expect(fake.toolResponses[0]).toMatchObject({ functionResponses: [{ response: { error: "down" } }] });
  });

  it("fails a turn that never completes", async () => {
    const fake = fakeOpen((text, emit) => {
      if (text.includes("joined")) emit(done);
    });
    await expect(runConversation(["Hello?"], { open: fake.open, callTool: vi.fn(), turnTimeoutMs: 50 })).rejects.toThrow(
      /did not finish/,
    );
  });

  it("fails when the session never opens", async () => {
    const open = () => new Promise<never>(() => {});
    await expect(runConversation(["Hello?"], { open, callTool: vi.fn(), turnTimeoutMs: 50 })).rejects.toThrow(
      /did not open/,
    );
  });
});
