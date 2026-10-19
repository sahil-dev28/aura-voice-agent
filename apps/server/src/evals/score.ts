import { normalizeOrderId } from "@/utils/orderId";

export type ToolCall = { name: string; args: Record<string, unknown>; result: unknown };
export type Conversation = { agentText: string; toolCalls: ToolCall[] };

export type Expectations = {
  toolsCalled?: string[];
  toolsNotCalled?: string[];
  noTools?: boolean;
  // At least one call to the tool must include these arguments.
  toolArgs?: { name: string; args: Record<string, unknown> }[];
  // Every order tool call must be about this order, so Aria never tries other IDs on her own.
  onlyOrderId?: string;
  replyMatches?: RegExp[];
  replyExcludes?: RegExp[];
};

export type Score = { passed: boolean; failures: string[] };

const ORDER_TOOLS = new Set(["get_order_details", "check_order_action", "confirm_order_action"]);

const includesArgs = (call: ToolCall, args: Record<string, unknown>) =>
  Object.entries(args).every(([key, value]) => call.args[key] === value);

export function scoreConversation(conversation: Conversation, expect: Expectations): Score {
  const { agentText, toolCalls } = conversation;
  const called = new Set(toolCalls.map((call) => call.name));
  const failures: string[] = [];

  for (const name of expect.toolsCalled ?? []) {
    if (!called.has(name)) failures.push(`expected a call to ${name}`);
  }
  for (const name of expect.toolsNotCalled ?? []) {
    if (called.has(name)) failures.push(`expected no call to ${name}`);
  }
  if (expect.noTools && toolCalls.length > 0) {
    failures.push(`expected no tool calls, got ${[...called].join(", ")}`);
  }
  for (const { name, args } of expect.toolArgs ?? []) {
    if (!toolCalls.some((call) => call.name === name && includesArgs(call, args))) {
      failures.push(`expected ${name} with ${JSON.stringify(args)}`);
    }
  }
  if (expect.onlyOrderId) {
    const others = toolCalls
      .filter((call) => ORDER_TOOLS.has(call.name))
      .map((call) => {
        const parsed = normalizeOrderId(String(call.args.order_id ?? ""));
        return parsed.ok ? parsed.orderId : String(call.args.order_id);
      })
      .filter((orderId) => orderId !== expect.onlyOrderId);
    if (others.length) failures.push(`expected order tools to use only ${expect.onlyOrderId}, got ${[...new Set(others)].join(", ")}`);
  }
  for (const pattern of expect.replyMatches ?? []) {
    if (!pattern.test(agentText)) failures.push(`expected the reply to match ${pattern}`);
  }
  for (const pattern of expect.replyExcludes ?? []) {
    if (pattern.test(agentText)) failures.push(`expected the reply not to match ${pattern}`);
  }

  return { passed: failures.length === 0, failures };
}
