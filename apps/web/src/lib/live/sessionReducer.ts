export type CallStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";

export type SessionState = { status: CallStatus; playing: boolean; agentTurnDone: boolean; error: string | null };

export type SessionEvent =
  | { type: "START" }
  | { type: "OPEN" }
  | { type: "USER_TRANSCRIPT" }
  | { type: "USER_PAUSE" }
  | { type: "TOOL_CALL" }
  | { type: "AUDIO_CHUNK" }
  | { type: "TURN_COMPLETE" }
  | { type: "PLAYBACK_DRAINED" }
  | { type: "INTERRUPTED" }
  | { type: "END" }
  | { type: "ERROR"; message: string };

export const initialSessionState: SessionState = { status: "idle", playing: false, agentTurnDone: false, error: null };

const LIVE: ReadonlySet<CallStatus> = new Set(["listening", "thinking", "speaking"]);
export const isLive = (status: CallStatus) => LIVE.has(status);

const toListening = (): SessionState => ({ status: "listening", playing: false, agentTurnDone: false, error: null });

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  const live = isLive(state.status);
  switch (event.type) {
    case "START":
      return state.status === "idle" || state.status === "ended" || state.status === "error"
        ? { ...initialSessionState, status: "connecting" }
        : state;
    case "OPEN":
      return state.status === "connecting" ? { ...state, status: "thinking" } : state;
    case "USER_TRANSCRIPT":
      return state.status === "thinking" && !state.playing ? { ...state, status: "listening" } : state;
    case "USER_PAUSE":
      return state.status === "listening" ? { ...state, status: "thinking" } : state;
    case "TOOL_CALL":
      return live && state.status !== "thinking" ? { ...state, status: "thinking" } : state;
    case "AUDIO_CHUNK":
      if (!live) return state;
      if (state.status === "speaking" && state.playing && !state.agentTurnDone) return state;
      return { ...state, status: "speaking", playing: true, agentTurnDone: false };
    case "TURN_COMPLETE":
      if (state.status === "thinking") return toListening();
      if (state.status !== "speaking") return state;
      return state.playing ? { ...state, agentTurnDone: true } : toListening();
    case "PLAYBACK_DRAINED":
      if (state.status !== "speaking") return state;
      return state.agentTurnDone ? toListening() : { ...state, playing: false };
    case "INTERRUPTED":
      return live ? toListening() : state;
    case "END":
      return live || state.status === "connecting" ? { ...initialSessionState, status: "ended" } : state;
    case "ERROR":
      return state.status === "idle" ? state : { ...initialSessionState, status: "error", error: event.message };
  }
}
