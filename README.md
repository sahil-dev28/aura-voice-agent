# Aura Assist: Voice Support Agent

Talk to **Aria**, a voice customer-support agent for the fictional D2C brand Aura Skincare, right in the browser.

**Live demo:** <web URL> · **API:** <server URL>

## Approach

The browser streams microphone audio straight to Google's Gemini Live speech-to-speech model using a short-lived token minted by my server, which keeps latency low and makes barge-in work out of the box. The server owns everything that must be trustworthy: the locked system prompt, the mock order database, and the policy rules (cancel / return / damage), which are plain tested TypeScript functions, so the model only explains decisions and never makes them. When the call ends, the transcript is turned into a structured JSON outcome with a schema-constrained Gemini call.

## Architecture

```
Browser (Next.js)                         API server (Express)                 Gemini
─────────────────                         ────────────────────                 ──────
Start Call ── POST /api/token ──────────► mint 1-use ephemeral token
                                          (locks model, voice, prompt, tools)
          ◄──────── token ────────────────
mic → AudioWorklet (16 kHz PCM) ─────────── WebSocket ─────────────────────────► Live model
speaker ◄ AudioWorklet (24 kHz PCM) ◄────── audio + transcripts ◄──────────────
tool call ── POST /api/tools/:name ──────► validate → order DB → policy rules
          ◄──────── result ───────────────
          ── tool response ─────────────────────────────────────────────────────►
End Call ── POST /api/summary ───────────► Gemini Flash + JSON schema
          ◄──────── call outcome ─────────
```

**Why this design**
- Speech-to-speech removes the STT → LLM → TTS hops, which is where most voice-agent latency comes from. Voice activity detection and interruption are built in.
- The browser connects directly, so the server never relays audio. It stays a small, stateless HTTP API that runs as a serverless function.
- The ephemeral token is single-use, expires in 30 minutes, and **locks** the session configuration. Nobody can swap the system prompt or tools from devtools, and the real API key never reaches the browser.

**Alternatives I considered**
- *Server relay to Gemini Live*: keeps the API key server-side and runs tools in-process, but it adds a hop to every audio frame and needs a host with long-lived WebSockets. The locked token already gives the security benefit.
- *Modular pipeline (e.g. Deepgram or Sarvam STT → LLM → Sarvam or ElevenLabs TTS)*: guarantees an Indian TTS voice and every stage is swappable, but it needs custom endpointing, barge-in and streaming TTS, and typically lands at 0.8–1.5 s+ per turn.

**Models:** `gemini-3.8-live` for the call and `gemini-3-flash-preview` for the summary. Both are set by environment variables, so they can be switched without a code change.

**Voice:** the brief prefers an Indian voice. Gemini Live's prebuilt voices aren't India-specific, so the system prompt asks Aria to speak natural Indian English (and Hindi or Hinglish when the customer does). I chose this over a modular pipeline with an Indian TTS voice because the latency and built-in barge-in matter more for a support call. The voice is set by `GEMINI_VOICE`, and if a guaranteed Indian voice became a hard requirement, I'd switch to the modular pipeline with an Indian TTS voice such as Sarvam.

## How the voice pipeline works

1. **Capture**: `getUserMedia` with echo cancellation and noise suppression. An AudioWorklet forwards raw frames, which are downsampled to 16 kHz, converted to 16-bit PCM and sent every ~40 ms.
2. **Turn-taking**: Gemini's voice activity detection decides when the customer has stopped talking (tuned for a ~500 ms pause).
3. **Playback**: 24 kHz PCM chunks go into a playback worklet queue. When Gemini signals `interrupted` (the customer talked over Aria), the queue is flushed instantly. That's barge-in.
4. **State indicator**: a small pure state machine maps session events to Listening / Thinking / Speaking (`apps/web/src/lib/live/sessionReducer.ts`).
5. **Transcript**: Gemini's input and output transcriptions are merged into speaker turns, with tool calls shown inline.

## How Aria decides to use a tool

Four tools are declared with descriptions that say exactly when to call them:

- `get_order_details(order_id)`: any question about a specific order.
- `check_order_action(order_id, action, product_opened?)`: before saying whether a cancellation, return or damaged-product replacement is possible. It only checks and never records anything, so "can I cancel?" is just a question.
- `confirm_order_action(order_id, action, product_opened?)`: only after the check was eligible and the customer clearly said yes. The server runs the policy again, records the request and returns a reference ID. Confirming the same order and action twice returns the same reference ID.
- `escalate_to_human(reason, order_id?, note)`: straight away when the customer asks for a person. Aria offers it, and calls it only if the customer agrees, after a policy refusal is disputed twice, after two failed attempts to understand the customer, or when the request is about Aura but no tool covers it. It opens an `ESC-XXXX` callback ticket and returns the callback promise, so Aria doesn't make up a timeline. A second escalation in the same call reuses the first ticket. Escalating never changes a policy decision.

All four are declared as blocking, so Aria waits for the real result instead of talking over it. The system prompt adds hard rules: never state order facts without a lookup in this call, never promise an action without an eligible result, and ask for the ID if it's missing. Spoken IDs like "order one oh one" or "one hundred and three" are normalised on the server. Unknown IDs come back as a normal `found: false` result, so Aria reads the ID back and asks the customer to verify it instead of guessing.

## Guardrails

1. **Locked session config**: the prompt, tools and voice are fixed in the token.
2. **Prompt rules**: answer only from brand knowledge and tool results, politely refuse anything unrelated to Aura, ask the customer to repeat when the audio is unclear, keep replies short, and reply in the customer's language (English, Hindi or Hinglish).
3. **Policy in code**: `apps/server/src/utils/orderPolicy.ts` decides eligibility and returns a reason code plus an explanation. The model only relays it, so a customer pushing for a 14-day-old return still gets a polite no.
4. **Validated edges**: tool arguments and summary requests are validated with Zod, and the summary output is schema-constrained and validated again.

## Assumptions

- Orders of exactly ₹499 get free delivery. The brief says "above ₹499" is free and "below ₹499" pays ₹50, so I read ₹499 itself as free.
- Mock order dates are relative ("delivered 14 days ago", "expected by 6 PM today" IST), so the demo stays correct on any day.
- There's no customer identity verification before sharing order details. A production agent would verify a phone number or email first.
- Confirmed actions return a reference ID but don't change the mock data, so every tester sees the same three orders.
- The token, summary and tool endpoints are rate-limited in memory per IP (5, 10 and 120 calls per 10 minutes). On serverless, this applies per instance; a shared store such as Redis would be needed at scale.

## Running locally

Prerequisites: Node 22+, pnpm 10, and a Gemini API key from https://aistudio.google.com/apikey (the free tier works).

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # add GEMINI_API_KEY
cp apps/web/.env.example apps/web/.env.local
pnpm dev                                       # web http://localhost:3000, api http://localhost:4000
```

| Script | What it does |
|---|---|
| `pnpm dev` | Runs the web app and the server |
| `pnpm test` | Unit and route tests (Vitest + Supertest) |
| `pnpm check-types` | Type-checks the whole monorepo |
| `pnpm build` | Production builds |

## Project structure

```
apps/
  server/src/
    agent/        system prompt, brand knowledge, tool declarations
    controller/   token, tool and summary handlers
    data/         mock order database
    middleware/   validation, rate limit
    routes/       /api/token, /api/tools, /api/orders, /api/summary
    schema/       Zod schemas
    utils/        order ID normalisation, policy rules, Gemini client
  web/src/
    app/          Next.js App Router
    components/   call UI
    lib/audio/    mic capture, playback, PCM helpers
    lib/live/     live session controller, state machine, transcript
packages/
  config/  env/  ui/
```

## Testing

`pnpm test` covers:
- order ID normalisation
- every policy rule, including the 20-day opened return and the 48-hour damage window
- the tool, token and summary endpoints, with Gemini mocked
- the rate limiter
- PCM conversion
- every state-machine transition

The voice flow itself is checked by hand against a list of test conversations: tracking, a refused return, an allowed cancellation, missing and unknown IDs, an out-of-scope request, barge-in, and Hinglish.

## How I think about it

### 1. Why this architecture and stack?

The thing that makes or breaks a voice agent is latency, so I started there. A speech-to-speech model (Gemini Live) skips the STT → LLM → TTS hops and gives me voice activity detection and barge-in for free, which would otherwise be the hardest parts to build. Letting the browser talk to Gemini directly means the server never touches audio, so it can stay a small stateless HTTP API on a serverless host.

The second rule was that the model talks but never decides. Anything that has to be right (order data, cancel / return / damage eligibility, the system prompt itself) lives on the server as plain TypeScript, and the ephemeral token locks the session config so it can't be changed from the browser. That splits the system into a part I can unit-test exactly (policy, ID parsing, endpoints) and a part I can only check by talking to it (the conversation).

The stack is the one I'm fastest and most careful in: a Turborepo monorepo with a Next.js web app, an Express API, shared `env` / `config` / `ui` packages, Zod at every edge and Vitest + Supertest for tests. Nothing in it is unusual, which was the point. The interesting part of this project is the voice loop, not the plumbing.

### 2. Most difficult part and how I solved it

Making Aria trustworthy with real order data. A live model is fluent and confident, which is exactly the problem: early on it would happily say an order "should arrive tomorrow" or "can be returned" without looking anything up, and it misheard IDs like "order one oh three" in many different ways.

I fixed it in layers instead of relying on one big prompt:
- **Decisions moved into code.** `check_order_action` returns `allowed`, a reason code and an explanation from `orderPolicy.ts`. Aria only relays the result, so pushing back doesn't change the answer.
- **Blocking tools and hard prompt rules.** Tools are declared as blocking so Aria waits for the result instead of talking over it, and the prompt forbids stating order facts or promising actions without a tool result from this call.
- **Server-side ID normalisation.** "one oh one", "one hundred and three", "double one" and "ORD 101" all resolve to `ORD-101`. Anything that doesn't parse, or isn't found, comes back as a normal result, so Aria reads the ID back and asks the customer to check it instead of guessing.

The other hard part was the call lifecycle. Audio, the WebSocket, tool calls and timers all run asynchronously, so ending a call and quickly starting a new one could let late messages from the old session leak into the new one. Every call now gets a run ID; callbacks from a stale run are ignored, cancelled tool calls are dropped, and Gemini's `goAway` notice is honoured using its `timeLeft` so the call ends cleanly instead of being cut off.

### 3. One more week: what first and why?

**An automated conversation test suite.** Right now the policy and plumbing are well covered by unit tests, but the conversation itself (does Aria call the tool, read back the ID, refuse politely, switch to Hinglish) is checked by hand. That is the riskiest part and the one most likely to regress whenever I change the prompt, the tools or the model version. I'd script the test conversations (tracking, refused return, allowed cancellation, missing and unknown IDs, off-topic, barge-in, Hinglish), play them in as synthesised audio, and score the transcript and tool calls automatically against expected outcomes. Every later change becomes safer once that exists.

After that, in order:
1. **Customer verification** (phone or email match) before sharing order details.
2. **Latency and error telemetry**: time to first audio, tool round-trip, interruptions and disconnects per call, so tuning is based on numbers.
3. **Real human handoff**: `escalate_to_human` opens a callback ticket today. Next, send that ticket and the call summary to a real support queue, and offer a live transfer when a specialist is free.

### 4. At 1,000 conversations a day, what changes?

1,000 calls a day is only around 10 to 30 calls at the same time at peak, so the architecture holds: audio already goes browser → Gemini directly and the API is stateless. What changes is everything around it:
- **Quotas and cost.** Move to a paid Gemini tier with enough concurrent Live sessions, set a maximum call length and idle timeout, and track cost per call.
- **Shared state.** The in-memory rate limiter only works per serverless instance, so it moves to Redis (or the platform's edge rate limiting). Rate limits should also be per verified customer, not just per IP.
- **Real data.** The mock order list becomes the real order and returns system, with timeouts, retries and caching, and allowed actions actually create the cancellation or return.
- **Storage and privacy.** Save transcripts, tool calls and summaries to a database for QA, analytics and disputes, with a retention policy and PII redaction.
- **Async summaries.** Generate the summary in a background job with retries, so a slow model call never blocks the end of a call.
- **Monitoring and QA.** Dashboards and alerts for latency, tool failures, disconnects and escalation rate, plus sampled transcripts reviewed regularly and the automated conversation suite running on every prompt or model change.
- **Fallbacks.** A clear "we're having trouble, please try again or chat with us" path when Gemini Live is degraded, instead of a silent failure.
