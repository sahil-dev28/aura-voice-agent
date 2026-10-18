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

## How the voice pipeline works

1. **Capture**: `getUserMedia` with echo cancellation and noise suppression. An AudioWorklet forwards raw frames, which are downsampled to 16 kHz, converted to 16-bit PCM and sent every ~40 ms.
2. **Turn-taking**: Gemini's voice activity detection decides when the customer has stopped talking (tuned for a ~500 ms pause).
3. **Playback**: 24 kHz PCM chunks go into a playback worklet queue. When Gemini signals `interrupted` (the customer talked over Aria), the queue is flushed instantly. That's barge-in.
4. **State indicator**: a small pure state machine maps session events to Listening / Thinking / Speaking (`apps/web/src/lib/live/sessionReducer.ts`).
5. **Transcript**: Gemini's input and output transcriptions are merged into speaker turns, with tool calls shown inline.

## How Aria decides to use a tool

Two tools are declared with descriptions that say exactly when to call them:

- `get_order_details(order_id)`: any question about a specific order.
- `check_order_action(order_id, action, product_opened?)`: before saying whether a cancellation, return or damaged-product replacement is possible.

Both are declared as blocking, so Aria waits for the real result instead of talking over it. The system prompt adds hard rules: never state order facts without a lookup in this call, never promise an action without an eligible result, and ask for the ID if it's missing. Spoken IDs like "order one oh one" or "one hundred and three" are normalised on the server. Unknown IDs come back as a normal `found: false` result, so Aria reads the ID back and asks the customer to verify it instead of guessing.

## Guardrails

1. **Locked session config**: the prompt, tools and voice are fixed in the token.
2. **Prompt rules**: answer only from brand knowledge and tool results, politely refuse anything unrelated to Aura, ask the customer to repeat when the audio is unclear, keep replies short, and reply in the customer's language (English, Hindi or Hinglish).
3. **Policy in code**: `apps/server/src/utils/orderPolicy.ts` decides eligibility and returns a reason code plus an explanation. The model only relays it, so a customer pushing for a 14-day-old return still gets a polite no.
4. **Validated edges**: tool arguments and summary requests are validated with Zod, and the summary output is schema-constrained and validated again.

## Assumptions

- Orders of exactly ₹499 get free delivery. The brief says "above ₹499" is free and "below ₹499" pays ₹50, so I read ₹499 itself as free.
- Mock order dates are relative ("delivered 14 days ago", "expected by 6 PM today" IST), so the demo stays correct on any day.
- There's no customer identity verification before sharing order details. A production agent would verify a phone number or email first.
- Allowed actions return a reference ID but don't change the mock data, so every tester sees the same three orders.
- The token endpoint is rate-limited in memory (5 calls per IP per 10 minutes). On serverless, this applies per instance.

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
<owner to write>

### 2. Most difficult part and how I solved it
<owner to write>

### 3. One more week: what first and why?
<owner to write>

### 4. At 1,000 conversations a day, what changes?
<owner to write>
