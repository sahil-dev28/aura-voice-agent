import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";

import { type CallMetrics, percentile } from "@/lib/live/metrics";

const seconds = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const spread = (values: number[], extra = "") =>
  values.length === 0
    ? "none"
    : `${seconds(percentile(values, 50))} median · ${seconds(percentile(values, 95))} p95${extra}`;

export function CallMetricsCard({ metrics }: { metrics: CallMetrics }) {
  const tools = metrics.toolCalls.map((call) => call.ms);
  const failedTools = metrics.toolCalls.filter((call) => !call.ok).length;
  const rows: [string, string][] = [
    ["Connect", seconds(metrics.connectMs)],
    ["First audio", seconds(metrics.firstAudioMs)],
    [`Reply latency (${count(metrics.turnLatenciesMs.length, "turn")})`, spread(metrics.turnLatenciesMs)],
    [`Tool calls (${tools.length})`, spread(tools, failedTools ? ` · ${failedTools} failed` : "")],
    ["Interruptions", String(metrics.interruptions)],
    ["Reconnects", String(metrics.reconnects)],
    ["Call length", seconds(metrics.durationMs)],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call metrics</CardTitle>
        <CardDescription>
          Measured in the browser. Reply latency runs from the end of your speech to Aria&apos;s first audio.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono">{value}</dd>
            </div>
          ))}
        </dl>
        {metrics.errors.length > 0 && (
          <p className="text-destructive text-sm">Errors: {metrics.errors.join("; ")}</p>
        )}
      </CardContent>
    </Card>
  );
}
