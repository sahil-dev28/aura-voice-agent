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
const fakePlayer = () => ({ enqueue: vi.fn(), flush: vi.fn(), close: vi.fn() });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function handlers() {
  return { onEvent: vi.fn(), onTranscript: vi.fn(), onToolEvents: vi.fn(), onFinished: vi.fn() };
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
