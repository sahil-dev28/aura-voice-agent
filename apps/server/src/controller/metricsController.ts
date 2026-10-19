import type { Request, Response } from "express";

import type { CallMetricsInput } from "@/schema/metrics";
import { formatUnknownError } from "@/utils/formatUnknownError";
import { percentile } from "@/utils/percentile";

// One JSON line per call: on a serverless host the log stream is the telemetry store, and it can be queried later.
export const recordMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const metrics = req.body as CallMetricsInput;
    const toolMs = metrics.toolCalls.map((call) => call.ms);
    console.info(
      JSON.stringify({
        event: "call_metrics",
        ...metrics,
        turnLatencyP50Ms: percentile(metrics.turnLatenciesMs, 50),
        turnLatencyP95Ms: percentile(metrics.turnLatenciesMs, 95),
        toolCallP95Ms: percentile(toolMs, 95),
        toolFailures: metrics.toolCalls.filter((call) => !call.ok).length,
      }),
    );
    res.status(200).json({ data: { received: true } });
    return;
  } catch (error) {
    res.status(500).json(formatUnknownError(error));
  }
};
