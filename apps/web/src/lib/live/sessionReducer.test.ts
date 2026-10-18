import { describe, expect, it } from "vitest";

import { type SessionEvent, type SessionState, initialSessionState, sessionReducer } from "@/lib/live/sessionReducer";

const run = (events: SessionEvent[], from: SessionState = initialSessionState) => events.reduce(sessionReducer, from);

describe("sessionReducer", () => {
  it("idle -> connecting -> thinking on open", () => {
    expect(run([{ type: "START" }]).status).toBe("connecting");
    expect(run([{ type: "START" }, { type: "OPEN" }]).status).toBe("thinking");
  });

  it("ignores a second START while connecting", () => {
    const state = run([{ type: "START" }]);
    expect(sessionReducer(state, { type: "START" })).toBe(state);
  });

  it("greeting audio -> speaking -> listening after turn complete and drain", () => {
    const s = run([{ type: "START" }, { type: "OPEN" }, { type: "AUDIO_CHUNK" }]);
    expect(s.status).toBe("speaking");
    const afterTurn = sessionReducer(s, { type: "TURN_COMPLETE" });
    expect(afterTurn.status).toBe("speaking");
    expect(sessionReducer(afterTurn, { type: "PLAYBACK_DRAINED" }).status).toBe("listening");
  });

  it("returns to listening when drain happens before turn complete", () => {
    const s = run([{ type: "START" }, { type: "OPEN" }, { type: "AUDIO_CHUNK" }, { type: "PLAYBACK_DRAINED" }]);
    expect(s.status).toBe("speaking");
    expect(sessionReducer(s, { type: "TURN_COMPLETE" }).status).toBe("listening");
  });

  it("a drain mid-turn does not end speaking", () => {
    const s = run([{ type: "START" }, { type: "OPEN" }, { type: "AUDIO_CHUNK" }, { type: "PLAYBACK_DRAINED" }, { type: "AUDIO_CHUNK" }]);
    expect(s).toMatchObject({ status: "speaking", playing: true });
  });

  it("user pause -> thinking, tool call -> thinking, user resumes -> listening", () => {
    const listening: SessionState = { ...initialSessionState, status: "listening" };
    expect(sessionReducer(listening, { type: "USER_PAUSE" }).status).toBe("thinking");
    expect(sessionReducer(listening, { type: "TOOL_CALL" }).status).toBe("thinking");
    const thinking = sessionReducer(listening, { type: "USER_PAUSE" });
    expect(sessionReducer(thinking, { type: "USER_TRANSCRIPT" }).status).toBe("listening");
  });

  it("interruption returns to listening", () => {
    const s = run([{ type: "START" }, { type: "OPEN" }, { type: "AUDIO_CHUNK" }, { type: "INTERRUPTED" }]);
    expect(s).toMatchObject({ status: "listening", playing: false, agentTurnDone: false });
  });

  it("turn complete without audio from thinking goes to listening", () => {
    const thinking: SessionState = { ...initialSessionState, status: "thinking" };
    expect(sessionReducer(thinking, { type: "TURN_COMPLETE" }).status).toBe("listening");
  });

  it("END while connecting ends the call", () => {
    expect(run([{ type: "START" }, { type: "END" }]).status).toBe("ended");
  });

  it("ignores late events after the call ended", () => {
    const ended = run([{ type: "START" }, { type: "OPEN" }, { type: "END" }]);
    expect(sessionReducer(ended, { type: "AUDIO_CHUNK" })).toBe(ended);
  });

  it("ERROR stores the message; START from error restarts", () => {
    const failed = run([{ type: "START" }, { type: "ERROR", message: "Mic blocked" }]);
    expect(failed).toMatchObject({ status: "error", error: "Mic blocked" });
    expect(sessionReducer(failed, { type: "START" })).toMatchObject({ status: "connecting", error: null });
  });

  it("returns the same object for repeated audio chunks", () => {
    const s = run([{ type: "START" }, { type: "OPEN" }, { type: "AUDIO_CHUNK" }]);
    expect(sessionReducer(s, { type: "AUDIO_CHUNK" })).toBe(s);
  });
});
