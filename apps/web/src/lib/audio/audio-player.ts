import { base64ToBytes, pcm16ToFloat, rms } from "@/lib/audio/pcm";

export type AudioPlayer = {
  enqueue: (base64Pcm24k: string) => void;
  flush: () => void;
  close: () => void;
  // Loudness of what is playing right now, for the orb.
  level: () => number;
};

export async function createAudioPlayer(onDrained: () => void): Promise<AudioPlayer> {
  const ctx = new AudioContext({ sampleRate: 24_000 });
  await ctx.audioWorklet.addModule("/worklets/pcm-player.js");
  const node = new AudioWorkletNode(ctx, "pcm-player", { outputChannelCount: [1] });
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const samples = new Float32Array(analyser.fftSize);
  node.connect(analyser);
  analyser.connect(ctx.destination);
  node.port.onmessage = (event: MessageEvent<string>) => {
    if (event.data === "drained") onDrained();
  };
  if (ctx.state === "suspended") await ctx.resume();

  return {
    enqueue: (base64) => {
      const bytes = base64ToBytes(base64);
      const samples = pcm16ToFloat(new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2)));
      node.port.postMessage(samples, [samples.buffer]);
    },
    flush: () => node.port.postMessage("flush"),
    level: () => {
      analyser.getFloatTimeDomainData(samples);
      return rms(samples);
    },
    close: () => {
      node.port.onmessage = null;
      node.disconnect();
      analyser.disconnect();
      void ctx.close();
    },
  };
}
