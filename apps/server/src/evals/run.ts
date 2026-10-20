import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { env } from "@aura/env/server";

import { app } from "@/app";
import { type LiveMessage, type RunnerDeps, runConversation } from "@/evals/runner";
import { type Scenario, scenarios } from "@/evals/scenarios";
import { type Score, scoreConversation } from "@/evals/score";
import { getGenAI, liveConnectConfig } from "@/utils/gemini";

// Usage: pnpm --filter server eval [scenario names...] [--repeat N]
const argv = process.argv.slice(2);
const repeatAt = argv.indexOf("--repeat");
const repeat = repeatAt >= 0 ? Math.max(1, Number(argv[repeatAt + 1]) || 1) : 1;
const names = argv.filter((arg, i) => !arg.startsWith("--") && !(repeatAt >= 0 && i === repeatAt + 1));
const selected = names.length ? scenarios.filter((scenario) => names.includes(scenario.name)) : scenarios;

const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address() as AddressInfo;

// Each run gets its own client address, so rate limits never leak between runs.
function depsFor(clientIp: string): RunnerDeps {
  return {
    open: async (onMessage) => {
      const session = await getGenAI().live.connect({
        model: env.GEMINI_LIVE_MODEL,
        config: liveConnectConfig(new Date()),
        callbacks: { onmessage: (message) => onMessage(message as LiveMessage) },
      });
      return {
        sendClientContent: (params) => session.sendClientContent(params),
        sendToolResponse: (params) => session.sendToolResponse(params),
        close: () => session.close(),
      };
    },
    callTool: async (name, args) => {
      const res = await fetch(`http://127.0.0.1:${port}/api/tools/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": clientIp },
        body: JSON.stringify(args),
      });
      const body = (await res.json()) as { data?: unknown; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body.data;
    },
  };
}

async function runOnce(scenario: Scenario, clientIp: string): Promise<Score & { transcript: string[] }> {
  try {
    const conversation = await runConversation(scenario.turns, depsFor(clientIp));
    return { ...scoreConversation(conversation, scenario.expect), transcript: conversation.transcript };
  } catch (error) {
    return { passed: false, failures: [error instanceof Error ? error.message : String(error)], transcript: [] };
  }
}

let failedScenarios = 0;
console.log(`Running ${selected.length} scenarios against ${env.GEMINI_LIVE_MODEL}, ${repeat}x each\n`);

for (const [index, scenario] of selected.entries()) {
  const runs: Awaited<ReturnType<typeof runOnce>>[] = [];
  for (let attempt = 0; attempt < repeat; attempt++) {
    runs.push(await runOnce(scenario, `10.${index}.${attempt}.${Date.now() % 250}`));
  }
  const passes = runs.filter((run) => run.passed).length;
  const ok = passes === repeat;
  if (!ok) failedScenarios += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${scenario.name}  (${passes}/${repeat})`);
  const failed = runs.find((run) => !run.passed);
  if (failed) {
    for (const failure of failed.failures) console.log(`      - ${failure}`);
    for (const line of failed.transcript) console.log(`        ${line}`);
  }
}

console.log(`\n${selected.length - failedScenarios}/${selected.length} scenarios passed every run`);
server.close();
process.exit(failedScenarios ? 1 : 0);
