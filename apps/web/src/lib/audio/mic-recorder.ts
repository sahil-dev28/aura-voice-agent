import { bytesToBase64, downsample, floatToPcm16 } from "@/lib/audio/pcm";

export type MicRecorder = { stop: () => void };

const CHUNK_SECONDS = 0.04;

function concat(parts: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function startMicRecorder(onChunk: (base64Pcm16k: string) => void): Promise<MicRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule("/worklets/pcm-recorder.js");
  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-recorder");
  const chunkSamples = Math.round(ctx.sampleRate * CHUNK_SECONDS);

  let pending: Float32Array[] = [];
  let pendingLength = 0;
  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    pending.push(event.data);
    pendingLength += event.data.length;
    if (pendingLength < chunkSamples) return;
    const merged = concat(pending, pendingLength);
    pending = [];
    pendingLength = 0;
    const pcm = floatToPcm16(downsample(merged, ctx.sampleRate));
    onChunk(bytesToBase64(new Uint8Array(pcm.buffer)));
  };

  source.connect(node);
  node.connect(ctx.destination);
  if (ctx.state === "suspended") await ctx.resume();

  return {
    stop: () => {
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      for (const track of stream.getTracks()) track.stop();
      void ctx.close();
    },
  };
}
