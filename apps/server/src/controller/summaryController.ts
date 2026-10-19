import type { Request, Response } from "express";
import { z } from "zod";

import { env } from "@aura/env/server";

import { type CallOutcome, type SummaryRequestInput, callOutcomeSchema } from "@/schema/summary";
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

const ATTEMPTS_PER_MODEL = 2;
const RETRY_DELAY_MS = 300;
// A Gemini request can occasionally hang; without a limit the customer would wait on "Generating summary" forever.
const ATTEMPT_TIMEOUT_MS = 20_000;

// Free-tier keys have a small daily quota per model, so a used-up model is skipped rather than retried.
const isQuotaError = (error: unknown) =>
  (error as { status?: number })?.status === 429 || /RESOURCE_EXHAUSTED/.test(String(error));

const isTimeout = (error: unknown) => (error as { name?: string })?.name === "TimeoutError";

async function generateOutcome(input: SummaryRequestInput, model: string): Promise<CallOutcome> {
  const response = await getGenAI().models.generateContent({
    model,
    contents: buildSummaryPrompt(input),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(callOutcomeSchema),
      temperature: 0.2,
      abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    },
  });
  const parsed = callOutcomeSchema.safeParse(JSON.parse(response.text ?? ""));
  if (!parsed.success) throw new Error(`Summary failed validation: ${parsed.error.message}`);
  return parsed.data;
}

export const createSummary = async (req: Request, res: Response): Promise<void> => {
  const input = req.body as SummaryRequestInput;
  const models = [...new Set([env.GEMINI_SUMMARY_MODEL, env.GEMINI_SUMMARY_FALLBACK_MODEL])];
  let quotaOnly = true;
  // An overloaded model or an off-schema answer usually works on a second try; a used-up quota or a hang won't.
  for (const model of models) {
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        res.status(200).json({ data: await generateOutcome(input, model) });
        return;
      } catch (error) {
        console.error(`Summary with ${model}, attempt ${attempt}, failed:`, error);
        if (isQuotaError(error)) break;
        quotaOnly = false;
        if (isTimeout(error)) break;
        if (attempt < ATTEMPTS_PER_MODEL) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  if (quotaOnly) {
    res.status(503).json({ error: "The summary quota for today is used up. Try again later." });
    return;
  }
  res.status(500).json({ error: "Could not generate summary" });
};
