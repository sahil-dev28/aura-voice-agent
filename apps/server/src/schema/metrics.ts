import { z } from "zod";

const ms = (max: number) => z.number().int().min(0).max(max);

export const callMetricsSchema = z.object({
  inputMode: z.enum(["voice", "text"]),
  durationMs: ms(3_600_000),
  connectMs: ms(120_000).nullable(),
  firstAudioMs: ms(120_000).nullable(),
  turnLatenciesMs: z.array(ms(120_000)).max(200),
  toolCalls: z.array(z.object({ name: z.string().max(40), ms: ms(120_000), ok: z.boolean() })).max(50),
  interruptions: z.number().int().min(0).max(1000),
  reconnects: z.number().int().min(0).max(10),
  errors: z.array(z.string().max(200)).max(10),
});

export type CallMetricsInput = z.infer<typeof callMetricsSchema>;
