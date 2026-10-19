"use client";

import { Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@aura/ui/components/badge";
import { Button } from "@aura/ui/components/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@aura/ui/components/card";

import type { SummaryState } from "@/lib/types";

type Props = { summary: SummaryState; onRetry: () => void };

export function CallSummary({ summary, onRetry }: Props) {
  if (summary.status === "idle") return null;

  const json = summary.status === "ready" ? JSON.stringify(summary.outcome, null, 2) : "";
  const copy = () => {
    navigator.clipboard.writeText(json).then(
      () => toast.success("Summary copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call outcome</CardTitle>
        <CardDescription>Structured summary generated after the call.</CardDescription>
        {summary.status === "ready" && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={copy}>
              <Copy data-icon="inline-start" />
              Copy JSON
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {summary.status === "loading" && (
          <p className="animate-pulse text-muted-foreground text-sm">Generating summary…</p>
        )}
        {summary.status === "empty" && (
          <p className="text-muted-foreground text-sm">No conversation was recorded, so there is nothing to summarise.</p>
        )}
        {summary.status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-destructive text-sm">{summary.message}</p>
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCcw data-icon="inline-start" />
              Retry
            </Button>
          </div>
        )}
        {summary.status === "ready" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <Badge>{summary.outcome.customer_intent}</Badge>
              <Badge variant="outline">{summary.outcome.resolution_status}</Badge>
              <Badge variant="outline">{summary.outcome.sentiment}</Badge>
              {summary.outcome.order_id && <Badge variant="secondary">{summary.outcome.order_id}</Badge>}
            </div>
            <p className="text-sm">{summary.outcome.call_summary}</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-xs">{json}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
