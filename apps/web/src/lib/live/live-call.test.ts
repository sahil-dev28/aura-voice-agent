import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  connect: vi.fn(),
  createAudioPlayer: vi.fn(),
  startMicRecorder: vi.fn(),
  callTool: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  },
  getToken: mocks.getToken,
  callTool: mocks.callTool,
}));
vi.mock("@/lib/audio/audio-player", () => ({ createAudioPlayer: mocks.createAudioPlayer }));
vi.mock("@/lib/audio/mic-recorder", () => ({ startMicRecorder: mocks.startMicRecorder }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    live = { connect: mocks.connect };
  },
}));

const { createLiveCall, parseDurationMs } = await import("@/lib/live/live-call");

type Callbacks = { onmessage: (m: unknown) => void; onclose: (e: { reason: string }) => void };

const fakeSession = () => ({ close: vi.fn(), sendClientContent: vi.fn(), sendRealtimeInput: vi.fn(), sendToolResponse: vi.fn() });
const fakeMic = () => ({ stop: vi.fn() });
const fakePlayer = () => ({ enqueue: vi.fn(), flush: vi.fn(), close: vi.fn(), level: vi.fn(() => 0.2) });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function handlers() {
  return { onEvent: vi.fn(), onTranscript: vi.fn(), onToolEvents: vi.fn(), onFinished: vi.fn(), onInputMode: vi.fn() };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mocks.createAudioPlayer.mockImplementation(async () => fakePlayer());
  mocks.startMicRecorder.mockImplementation(async () => fakeMic());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("createLiveCall restart race", () => {
  it("a run ended while connecting never connects and never tears down the next run", async () => {
    const firstToken = deferred<{ token: string; model: string }>();
    mocks.getToken.mockReturnValueOnce(firstToken.promise).mockResolvedValueOnce({ token: "t2", model: "m" });
    const session2 = fakeSession();
    mocks.connect.mockResolvedValueOnce(session2);
    const h = handlers();
    const call = createLiveCall(h);

    void call.start();
    await flush();
    call.end();
    await call.start();

    const mic2 = await mocks.startMicRecorder.mock.results[1]?.value;
    firstToken.resolve({ token: "t1", model: "m" });
    await flush();

    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(session2.close).not.toHaveBeenCalled();
    expect(mic2.stop).not.toHaveBeenCalled();
  });

  it("ignores close events from a superseded session", async () => {
    const session1 = fakeSession();
    const session2 = fakeSession();
    mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
    mocks.connect.mockResolvedValueOnce(session1).mockResolvedValueOnce(session2);
    const h = handlers();
    const call = createLiveCall(h);

    await call.start();
    const first = mocks.connect.mock.calls[0]?.[0].callbacks as Callbacks;
    call.end();
    await call.start();
    h.onEvent.mockClear();

    first.onclose({ reason: "late close" });

    expect(h.onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR" }));
  });
});

describe("goAway", () => {
  it("waits for timeLeft before ending the call", async () => {
    mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
    mocks.connect.mockResolvedValueOnce(fakeSession());
    const h = handlers();
    const call = createLiveCall(h);
    await call.start();
    const { onmessage } = mocks.connect.mock.calls[0]?.[0].callbacks as Callbacks;

    vi.useFakeTimers();
    onmessage({ goAway: { timeLeft: "5s" } });
    expect(h.onEvent).not.toHaveBeenCalledWith({ type: "END" });
    vi.advanceTimersByTime(5000);
    expect(h.onEvent).toHaveBeenCalledWith({ type: "END" });
  });
});

describe("escalate_to_human", () => {
  it("reuses the first ticket for the rest of the call", async () => {
    mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
    const session = fakeSession();
    mocks.connect.mockResolvedValueOnce(session);
    mocks.callTool.mockResolvedValueOnce({ escalated: true, ticketId: "ESC-4F2A" });
    const call = createLiveCall(handlers());
    await call.start();
    const { onmessage } = mocks.connect.mock.calls[0]?.[0].callbacks as Callbacks;
    const escalation = (id: string) => ({
      toolCall: { functionCalls: [{ id, name: "escalate_to_human", args: { reason: "customer_request", note: "x" } }] },
    });

    onmessage(escalation("a"));
    await flush();
    onmessage(escalation("b"));
    await flush();

    expect(mocks.callTool).toHaveBeenCalledTimes(1);
    const second = session.sendToolResponse.mock.calls[1]?.[0].functionResponses[0];
    expect(second).toMatchObject({ id: "b", response: { output: { ticketId: "ESC-4F2A" } } });
  });
});

async function startLiveCall() {
  mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
  const session = fakeSession();
  mocks.connect.mockResolvedValueOnce(session);
  const h = handlers();
  const call = createLiveCall(h);
  await call.start();
  const { onmessage, onclose } = mocks.connect.mock.calls[0]?.[0].callbacks as Callbacks;
  return { h, call, session, onmessage, onclose };
}

const sentTexts = (session: ReturnType<typeof fakeSession>) =>
  session.sendClientContent.mock.calls.map(([content]) => String(content.turns[0].parts[0].text));

const agentDone = { serverContent: { turnComplete: true } };
const customerSpeech = { serverContent: { inputTranscription: { text: "hello" } } };

describe("silence", () => {
  it("asks if the customer is still there after 10 seconds of silence", async () => {
    const { session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);

    vi.advanceTimersByTime(9_999);
    expect(sentTexts(session)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sentTexts(session)[1]).toMatch(/^Call system:.*still there/);
  });

  it("says goodbye and ends after a second silence", async () => {
    const { h, session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);
    vi.advanceTimersByTime(10_000);
    onmessage(agentDone);
    vi.advanceTimersByTime(10_000);
    expect(sentTexts(session)[2]).toMatch(/^Call system:.*goodbye/);
    expect(h.onEvent).not.toHaveBeenCalledWith({ type: "END" });

    onmessage(agentDone);
    expect(h.onEvent).toHaveBeenCalledWith({ type: "END" });
  });

  it("waits while the mic hears the customer, before any transcript arrives", async () => {
    const { session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string, level: number) => void;
    onmessage(agentDone);

    vi.advanceTimersByTime(8_000);
    sendAudio("pcm", 0.001);
    vi.advanceTimersByTime(2_000);
    expect(sentTexts(session)[1]).toMatch(/still there/);
  });

  it("restarts the silence timer when the mic hears speech", async () => {
    const { session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string, level: number) => void;
    onmessage(agentDone);

    vi.advanceTimersByTime(8_000);
    sendAudio("pcm", 0.1);
    vi.advanceTimersByTime(9_999);
    expect(sentTexts(session)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sentTexts(session)[1]).toMatch(/still there/);
  });

  it("starts over when the customer speaks", async () => {
    const { session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);
    vi.advanceTimersByTime(10_000);
    onmessage(customerSpeech);
    vi.advanceTimersByTime(700);
    onmessage(agentDone);
    vi.advanceTimersByTime(10_000);
    expect(sentTexts(session)[2]).toMatch(/still there/);
  });
});

describe("transcript turns", () => {
  it("puts each Aria turn on its own line", async () => {
    const { h, onmessage } = await startLiveCall();
    onmessage({ serverContent: { outputTranscription: { text: "Your ticket is ready." } } });
    onmessage(agentDone);
    onmessage({ serverContent: { outputTranscription: { text: "Are you still there?" } } });

    const last = h.onTranscript.mock.calls.at(-1)?.[0] as { text: string }[];
    expect(last.map((e) => e.text)).toEqual(["Your ticket is ready.", "Are you still there?"]);
  });
});

describe("mute", () => {
  const audioCalls = (session: ReturnType<typeof fakeSession>) =>
    session.sendRealtimeInput.mock.calls.filter(([input]) => "audio" in input).length;

  it("stops sending audio and ends the audio stream once", async () => {
    const { call, session } = await startLiveCall();
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string, level: number) => void;

    call.setMuted(true);
    call.setMuted(true);
    sendAudio("pcm", 0.1);

    expect(session.sendRealtimeInput).toHaveBeenCalledTimes(1);
    expect(session.sendRealtimeInput).toHaveBeenCalledWith({ audioStreamEnd: true });
    expect(audioCalls(session)).toBe(0);

    call.setMuted(false);
    sendAudio("pcm", 0.1);
    expect(audioCalls(session)).toBe(1);
  });

  it("pauses the silence check-in while muted", async () => {
    const { call, session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);

    call.setMuted(true);
    vi.advanceTimersByTime(30_000);
    expect(sentTexts(session)).toHaveLength(1);

    call.setMuted(false);
    vi.advanceTimersByTime(10_000);
    expect(sentTexts(session)[1]).toMatch(/still there/);
  });

  it("starts the next call unmuted", async () => {
    const { call } = await startLiveCall();
    call.setMuted(true);
    call.end();
    const next = fakeSession();
    mocks.connect.mockResolvedValueOnce(next);
    await call.start();

    const sendAudio = mocks.startMicRecorder.mock.calls[1]?.[0] as (data: string, level: number) => void;
    sendAudio("pcm", 0.1);
    expect(audioCalls(next)).toBe(1);
  });
});

describe("photo uploads", () => {
  it("tells Aria and records the upload while the call is live", async () => {
    const { h, call, session } = await startLiveCall();
    call.notePhotos({ referenceId: "RPL-1A2B", photoCount: 2, maxPhotos: 3 });

    expect(sentTexts(session)[1]).toMatch(/^Call system:.*2 photos.*RPL-1A2B/);
    const events = h.onToolEvents.mock.calls.at(-1)?.[0] as { name: string }[];
    expect(events.at(-1)?.name).toBe("photo_upload");
    const entries = h.onTranscript.mock.calls.at(-1)?.[0] as { text: string }[];
    expect(entries.at(-1)?.text).toBe("Photos received for RPL-1A2B: 2 of 3");
  });

  it("pauses the silence check-in while the customer is choosing photos", async () => {
    const { call, session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);

    call.setBusy(true);
    vi.advanceTimersByTime(30_000);
    expect(sentTexts(session)).toHaveLength(1);

    call.setBusy(false);
    vi.advanceTimersByTime(10_000);
    expect(sentTexts(session)[1]).toMatch(/still there/);
  });

  it("does nothing once the call has ended", async () => {
    const { call, session } = await startLiveCall();
    call.end();
    call.notePhotos({ referenceId: "RPL-1A2B", photoCount: 1, maxPhotos: 3 });
    expect(sentTexts(session)).toHaveLength(1);
  });
});

describe("typing", () => {
  it("carries on in typing mode when the mic is blocked", async () => {
    mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
    const session = fakeSession();
    mocks.connect.mockResolvedValueOnce(session);
    mocks.startMicRecorder.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
    const h = handlers();
    await createLiveCall(h).start();

    expect(h.onInputMode).toHaveBeenLastCalledWith("text");
    expect(mocks.connect).toHaveBeenCalled();
    expect(sentTexts(session)[0]).toMatch(/will type/);
    expect(h.onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR" }));
  });

  it("still fails on other mic errors", async () => {
    mocks.getToken.mockResolvedValue({ token: "t", model: "m" });
    mocks.startMicRecorder.mockRejectedValueOnce(new Error("worklet failed"));
    const h = handlers();
    await createLiveCall(h).start();
    expect(h.onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR" }));
  });

  it("uses voice mode when the mic works", async () => {
    const { h } = await startLiveCall();
    expect(h.onInputMode).toHaveBeenLastCalledWith("voice");
  });

  it("sends a typed message as a labelled customer turn", async () => {
    const { h, call, session } = await startLiveCall();
    call.sendTyped("  Where is ORD-101?  ");
    call.sendTyped("Thanks");

    expect(sentTexts(session)[1]).toBe("Customer (typed): Where is ORD-101?");
    const entries = h.onTranscript.mock.calls.at(-1)?.[0] as { role: string; text: string }[];
    expect(entries.slice(-2)).toMatchObject([
      { role: "customer", text: "Where is ORD-101?" },
      { role: "customer", text: "Thanks" },
    ]);
    expect(h.onEvent).toHaveBeenCalledWith({ type: "USER_TRANSCRIPT" });
  });

  it("ignores blank messages and messages after the call ends", async () => {
    const { call, session } = await startLiveCall();
    call.sendTyped("   ");
    call.end();
    call.sendTyped("hello");
    expect(sentTexts(session)).toHaveLength(1);
  });

  it("restarts the silence timer while the customer types", async () => {
    const { call, session, onmessage } = await startLiveCall();
    vi.useFakeTimers();
    onmessage(agentDone);
    vi.advanceTimersByTime(8_000);
    call.noteTyping();
    vi.advanceTimersByTime(9_999);
    expect(sentTexts(session)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sentTexts(session)[1]).toMatch(/still there/);
  });
});

describe("call metrics", () => {
  const audioChunk = { serverContent: { modelTurn: { parts: [{ inlineData: { data: "AAAA", mimeType: "audio/pcm;rate=24000" } }] } } };
  const finished = (h: ReturnType<typeof handlers>) => h.onFinished.mock.calls.at(-1)?.[0].metrics;

  it("reports connect time, reply latency and tool calls when the call ends", async () => {
    mocks.callTool.mockResolvedValueOnce({ found: true });
    const { h, call, onmessage } = await startLiveCall();
    call.sendTyped("Where is ORD-101?");
    onmessage(audioChunk);
    onmessage({ toolCall: { functionCalls: [{ id: "t1", name: "get_order_details", args: { order_id: "ORD-101" } }] } });
    await flush();
    call.end();

    const metrics = finished(h);
    expect(metrics).toMatchObject({ inputMode: "voice", interruptions: 0, reconnects: 0, errors: [] });
    expect(metrics.connectMs).toEqual(expect.any(Number));
    expect(metrics.turnLatenciesMs).toHaveLength(1);
    expect(metrics.toolCalls).toEqual([{ name: "get_order_details", ms: expect.any(Number), ok: true }]);
  });

  it("marks failed tool calls", async () => {
    mocks.callTool.mockRejectedValueOnce(new Error("down"));
    const { h, call, onmessage } = await startLiveCall();
    onmessage({ toolCall: { functionCalls: [{ id: "t1", name: "get_order_details", args: {} }] } });
    await flush();
    call.end();
    expect(finished(h).toolCalls[0]).toMatchObject({ ok: false });
  });

  it("counts interruptions and reconnects", async () => {
    const { h, call, onmessage, onclose } = await startLiveCall();
    mocks.connect.mockResolvedValueOnce(fakeSession());
    onmessage({ serverContent: { interrupted: true } });
    onmessage({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    onclose({ reason: "network" });
    await flush();
    call.end();
    expect(finished(h)).toMatchObject({ interruptions: 1, reconnects: 1 });
  });

  it("records the error that ended the call", async () => {
    const { h, onclose } = await startLiveCall();
    onclose({ reason: "network" });
    expect(finished(h).errors).toEqual(["Call disconnected: network"]);
  });
});

describe("levels", () => {
  it("reports Aria's playback level and the last mic level", async () => {
    const { call } = await startLiveCall();
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string, level: number) => void;
    sendAudio("pcm", 0.07);
    expect(call.levels()).toEqual({ agent: 0.2, mic: 0.07 });
  });

  it("reports no mic level while muted, and nothing once the call ends", async () => {
    const { call } = await startLiveCall();
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string, level: number) => void;
    sendAudio("pcm", 0.07);
    call.setMuted(true);
    expect(call.levels().mic).toBe(0);
    call.end();
    expect(call.levels()).toEqual({ agent: 0, mic: 0 });
  });
});

describe("call length limit", () => {
  it("asks Aria to wrap up a minute before the limit, then ends the call", async () => {
    vi.useFakeTimers();
    const { h, session, onmessage } = await startLiveCall();
    const keepTalking = setInterval(() => onmessage(customerSpeech), 5_000);

    vi.advanceTimersByTime(9 * 60_000);
    expect(sentTexts(session).some((text) => /^Call system:.*wrap up/i.test(text))).toBe(true);
    expect(h.onEvent).not.toHaveBeenCalledWith({ type: "END" });
    vi.advanceTimersByTime(60_000);
    expect(h.onEvent).toHaveBeenCalledWith({ type: "END" });
    clearInterval(keepTalking);
  });
});

describe("session resumption", () => {
  it("reconnects with the latest handle on goAway without restarting the mic", async () => {
    const { h, session, onmessage } = await startLiveCall();
    const next = fakeSession();
    mocks.connect.mockResolvedValueOnce(next);
    onmessage({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    onmessage({ sessionResumptionUpdate: { newHandle: "", resumable: false } });

    onmessage({ goAway: { timeLeft: "5s" } });
    await flush();

    expect(mocks.getToken).toHaveBeenLastCalledWith("h1");
    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(session.close).toHaveBeenCalled();
    expect(mocks.startMicRecorder).toHaveBeenCalledTimes(1);
    expect(next.sendClientContent).not.toHaveBeenCalled();

    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string) => void;
    sendAudio("pcm");
    expect(next.sendRealtimeInput).toHaveBeenCalled();
    expect(h.onEvent).not.toHaveBeenCalledWith({ type: "END" });
  });

  it("resumes once after an unexpected disconnect", async () => {
    const { h, onmessage, onclose } = await startLiveCall();
    mocks.connect.mockResolvedValueOnce(fakeSession());
    onmessage({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });

    onclose({ reason: "network" });
    await flush();

    expect(mocks.connect).toHaveBeenCalledTimes(2);
    expect(h.onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ERROR" }));
  });

  it("stops sending audio to a dropped session while reconnecting", async () => {
    const { session, onmessage, onclose } = await startLiveCall();
    mocks.connect.mockResolvedValueOnce(fakeSession());
    onmessage({ sessionResumptionUpdate: { newHandle: "h1", resumable: true } });
    const sendAudio = mocks.startMicRecorder.mock.calls[0]?.[0] as (data: string) => void;

    onclose({ reason: "network" });
    sendAudio("pcm");

    expect(session.sendRealtimeInput).not.toHaveBeenCalled();
  });

  it("fails when the session drops before any handle arrived", async () => {
    const { h, onclose } = await startLiveCall();
    onclose({ reason: "network" });
    expect(h.onEvent).toHaveBeenCalledWith({ type: "ERROR", message: "Call disconnected: network" });
  });
});

describe("parseDurationMs", () => {
  it.each([
    ["5s", 5000],
    ["2.5s", 2500],
    [undefined, 0],
    ["garbage", 0],
  ])("%s -> %i", (input, ms) => {
    expect(parseDurationMs(input)).toBe(ms);
  });
});
