import { base64ToBytes, pcm16ToFloat } from "@/lib/audio/pcm";

export type AudioPlayer = {
  enqueue: (base64Pcm24k: string) => void;
  flush: () => void;
  close: () => void;
};

export async function createAudioPlayer(onDrained: () => void): Promise<AudioPlayer> {
  const ctx = new AudioContext({ sampleRate: 24_000 });
  await ctx.audioWorklet.addModule("/worklets/pcm-player.js");
  const node = new AudioWorkletNode(ctx, "pcm-player", { outputChannelCount: [1] });
  node.connect(ctx.destination);
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
    close: () => {
      node.port.onmessage = null;
      node.disconnect();
      void ctx.close();
    },
  };
}
