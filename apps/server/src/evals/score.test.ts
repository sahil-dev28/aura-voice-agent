import { describe, expect, it } from "vitest";

import { type Conversation, scoreConversation } from "@/evals/score";

const conversation: Conversation = {
  agentText: "Your order ORD-101 is out for delivery and should arrive by 6 PM today.",
  toolCalls: [{ name: "get_order_details", args: { order_id: "ORD-101", phone_last4: "3721" }, result: { found: true } }],
};

describe("scoreConversation", () => {
  it("passes when every expectation holds", () => {
    const score = scoreConversation(conversation, {
      toolsCalled: ["get_order_details"],
      toolsNotCalled: ["confirm_order_action"],
      toolArgs: [{ name: "get_order_details", args: { phone_last4: "3721" } }],
      replyMatches: [/6 ?PM/i],
      replyExcludes: [/12:30/],
    });
    expect(score).toEqual({ passed: true, failures: [] });
  });

  it("lists every failed expectation", () => {
    const score = scoreConversation(conversation, {
      toolsCalled: ["check_order_action"],
      toolsNotCalled: ["get_order_details"],
      toolArgs: [{ name: "get_order_details", args: { phone_last4: "0000" } }],
      replyMatches: [/cancelled/],
      replyExcludes: [/ORD-101/],
    });
    expect(score.passed).toBe(false);
    expect(score.failures).toEqual([
      "expected a call to check_order_action",
      "expected no call to get_order_details",
      'expected get_order_details with {"phone_last4":"0000"}',
      "expected the reply to match /cancelled/",
      "expected the reply not to match /ORD-101/",
    ]);
  });

  it("can require that no tool is called at all", () => {
    expect(scoreConversation(conversation, { noTools: true }).failures).toEqual([
      "expected no tool calls, got get_order_details",
    ]);
    expect(scoreConversation({ agentText: "hi", toolCalls: [] }, { noTools: true }).passed).toBe(true);
  });

  it("can require that order tools only see one order id", () => {
    const wandering: Conversation = {
      agentText: "",
      toolCalls: [
        { name: "get_order_details", args: { order_id: "ORD-999" }, result: {} },
        { name: "get_order_details", args: { order_id: "ORD-998" }, result: {} },
      ],
    };
    expect(scoreConversation(wandering, { onlyOrderId: "ORD-999" }).failures).toEqual([
      "expected order tools to use only ORD-999, got ORD-998",
    ]);
  });
});
