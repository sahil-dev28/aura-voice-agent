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
