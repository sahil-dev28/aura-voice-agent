import type { Conversation, ToolCall } from "@/evals/score";

// The parts of a Gemini Live message and session the runner uses, so tests can drive it with a fake.
export type LiveMessage = {
  serverContent?: { outputTranscription?: { text?: string }; turnComplete?: boolean };
  toolCall?: { functionCalls?: { id?: string; name?: string; args?: Record<string, unknown> }[] };
};

export type LiveSessionLike = {
  sendClientContent: (params: { turns: { role: string; parts: { text: string }[] }[]; turnComplete: boolean }) => void;
  sendToolResponse: (params: {
    functionResponses: { id?: string; name: string; response: Record<string, unknown> }[];
  }) => void;
  close: () => void;
};

export type RunnerDeps = {
  open: (onMessage: (message: LiveMessage) => void) => Promise<LiveSessionLike>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  turnTimeoutMs?: number;
};

export type ConversationResult = Conversation & { transcript: string[] };

const GREETING_TRIGGER = "The customer has just joined the call. Greet them now.";

export async function runConversation(turns: string[], deps: RunnerDeps): Promise<ConversationResult> {
  const toolCalls: ToolCall[] = [];
  const transcript: string[] = [];
  const replies: string[] = [];
  let turnText = "";
  let pendingTools = 0;
  let calledTool = false;
  let spokeAfterTool = false;
  let finishTurn: (() => void) | null = null;
  const timeoutMs = deps.turnTimeoutMs ?? 45_000;

  // A turn is over at turnComplete, but only once any tool result has gone back and Aria has answered it.
  const maybeFinish = () => {
    if (pendingTools > 0 || (calledTool && !spokeAfterTool)) return;
    finishTurn?.();
  };

  async function runTools(calls: NonNullable<LiveMessage["toolCall"]>["functionCalls"] = []) {
    calledTool = true;
    spokeAfterTool = false;
    pendingTools += calls.length;
    const functionResponses = await Promise.all(
      calls.map(async ({ id, name = "", args = {} }) => {
        let response: Record<string, unknown>;
        try {
          const result = await deps.callTool(name, args);
          toolCalls.push({ name, args, result });
          response = { output: result };
        } catch (error) {
          toolCalls.push({ name, args, result: { error: String(error) } });
          response = { error: error instanceof Error ? error.message : String(error) };
        }
        return { id, name, response };
      }),
    );
    pendingTools -= calls.length;
    session.sendToolResponse({ functionResponses });
  }

  const opening = deps.open((message) => {
    const text = message.serverContent?.outputTranscription?.text;
    if (text) {
      turnText += text;
      if (calledTool) spokeAfterTool = true;
    }
    if (message.toolCall?.functionCalls?.length) void runTools(message.toolCall.functionCalls);
    if (message.serverContent?.turnComplete) maybeFinish();
  });
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  const session = await Promise.race([
    opening,
    new Promise<never>((_, reject) => {
      openTimer = setTimeout(() => reject(new Error(`Live session did not open within ${timeoutMs} ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(openTimer));

  async function turn(text: string) {
    turnText = "";
    calledTool = false;
    spokeAfterTool = false;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Turn "${text}" did not finish within ${timeoutMs} ms`)), timeoutMs);
      finishTurn = () => {
        clearTimeout(timer);
        finishTurn = null;
        resolve();
      };
      session.sendClientContent({ turns: [{ role: "user", parts: [{ text }] }], turnComplete: true });
    });
    const reply = turnText.trim();
    if (reply) {
      replies.push(reply);
      transcript.push(`Aria: ${reply}`);
    }
  }

  try {
    await turn(GREETING_TRIGGER);
    for (const customer of turns) {
      transcript.push(`Customer: ${customer}`);
      await turn(`Customer (typed): ${customer}`);
    }
  } finally {
    session.close();
  }
  return { agentText: replies.join(" "), toolCalls, transcript };
}
