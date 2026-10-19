import type { Request, Response } from "express";
import { z } from "zod";

import { env } from "@aura/env/server";

import { type SummaryRequestInput, callOutcomeSchema } from "@/schema/summary";
import { getGenAI } from "@/utils/gemini";

const ROLE_LABEL = { customer: "Customer", agent: "Aria", tool: "Tool" } as const;

function buildSummaryPrompt({ transcript, toolEvents }: SummaryRequestInput): string {
  const lines = transcript.map((entry) => `${ROLE_LABEL[entry.role]}: ${entry.text.trim()}`).join("\n");
  return `You write structured outcomes for Aura Skincare customer support calls. Use only what is in the transcript and tool results below.

Field rules:
- customer_intent: the main reason for the call.
- order_id: the main order discussed in ORD-### form, or null if none was confirmed by a tool.
- resolution_status: RESOLVED if the question was answered or the request was handled; POLICY_DECLINED if the main request was refused under policy and the customer was told why; UNRESOLVED if the call ended before an answer; ESCALATION_NEEDED if a human must follow up (for example escalate_to_human opened a ticket, the customer disputes a refusal, or a replacement needs photo review).
- sentiment: the customer's overall tone.
- policy_flags: reason codes from tool results that matter (for example RETURN_WINDOW_EXPIRED, NOT_CANCELLABLE_IN_TRANSIT), plus OUT_OF_SCOPE_REQUEST if the customer asked for something unrelated to Aura.
- call_summary: one to three sentences in English, past tense, including any reference or ticket IDs.
- follow_up_required: true if someone at Aura must act after the call (a recorded cancellation, return or replacement, or an escalation).

Transcript:
${lines}

Tool results:
${JSON.stringify(toolEvents)}`;
}

export const createSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const input = req.body as SummaryRequestInput;
    const response = await getGenAI().models.generateContent({
      model: env.GEMINI_SUMMARY_MODEL,
      contents: buildSummaryPrompt(input),
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(callOutcomeSchema),
        temperature: 0.2,
      },
    });
    const parsed = callOutcomeSchema.safeParse(JSON.parse(response.text ?? ""));
    if (!parsed.success) throw new Error(`Summary failed validation: ${parsed.error.message}`);

    res.status(200).json({ data: parsed.data });
    return;
  } catch (error) {
    console.error("Summary failed:", error);
    res.status(500).json({ error: "Could not generate summary" });
  }
};
