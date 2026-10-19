export type CallMetrics = {
  inputMode: "voice" | "text";
  durationMs: number;
  connectMs: number | null;
  firstAudioMs: number | null;
  turnLatenciesMs: number[];
  toolCalls: { name: string; ms: number; ok: boolean }[];
  interruptions: number;
  reconnects: number;
  errors: string[];
};

// Nearest-rank percentile, so the value is always one that was actually measured.
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? null;
}

export function createMetrics(now: () => number = Date.now) {
  let startedAt = 0;
  let openedAt: number | null = null;
  let firstAudioAt: number | null = null;
  // Set by the customer's last sound and cleared by the first audio of Aria's reply.
  let lastCustomerAt: number | null = null;
  const turnLatenciesMs: number[] = [];
  const toolCalls: CallMetrics["toolCalls"] = [];
  const errors: string[] = [];
  let interruptions = 0;
  let reconnects = 0;

  return {
    started: () => {
      startedAt = now();
    },
    opened: () => {
      openedAt ??= now();
    },
    customerSpoke: () => {
      lastCustomerAt = now();
    },
    agentAudio: () => {
      const t = now();
      firstAudioAt ??= t;
      if (lastCustomerAt === null) return;
      turnLatenciesMs.push(t - lastCustomerAt);
      lastCustomerAt = null;
    },
    toolDone: (name: string, ms: number, ok: boolean) => {
      toolCalls.push({ name, ms, ok });
    },
    interrupted: () => {
      interruptions += 1;
    },
    reconnected: () => {
      reconnects += 1;
    },
    error: (message: string) => {
      errors.push(message);
    },
    finish: (inputMode: CallMetrics["inputMode"]): CallMetrics => ({
      inputMode,
      durationMs: now() - startedAt,
      connectMs: openedAt === null ? null : openedAt - startedAt,
      firstAudioMs: openedAt === null || firstAudioAt === null ? null : firstAudioAt - openedAt,
      turnLatenciesMs: [...turnLatenciesMs],
      toolCalls: [...toolCalls],
      interruptions,
      reconnects,
      errors: [...errors],
    }),
  };
}
