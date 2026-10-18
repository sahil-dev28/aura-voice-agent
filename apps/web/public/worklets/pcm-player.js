class PcmPlayer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.offset = 0;
    this.playing = false;
    this.port.onmessage = (event) => {
      if (event.data === "flush") {
        this.queue = [];
        this.offset = 0;
        if (this.playing) {
          this.playing = false;
          this.port.postMessage("drained");
        }
        return;
      }
      this.queue.push(event.data);
      this.playing = true;
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    let i = 0;
    while (i < out.length && this.queue.length) {
      const current = this.queue[0];
      const n = Math.min(out.length - i, current.length - this.offset);
      out.set(current.subarray(this.offset, this.offset + n), i);
      i += n;
      this.offset += n;
      if (this.offset >= current.length) {
        this.queue.shift();
        this.offset = 0;
      }
    }
    if (i < out.length) out.fill(0, i);
    if (this.playing && this.queue.length === 0) {
      this.playing = false;
      this.port.postMessage("drained");
    }
    return true;
  }
}

registerProcessor("pcm-player", PcmPlayer);
