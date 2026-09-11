// Gathers the microphone for an OmniChat call and hands it to the page.
//
// The render thread calls process() with 128 samples at a time, several
// hundred times a second. Posting each of those would flood the message port,
// so they are gathered into batches first; the page turns batches into
// 100 ms chunks of 16 kHz audio.
const BATCH = 1024;

class LiveCallCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(BATCH);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel) return true;
    let offset = 0;
    while (offset < channel.length) {
      const take = Math.min(BATCH - this.filled, channel.length - offset);
      this.batch.set(channel.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;
      if (this.filled === BATCH) {
        this.port.postMessage(this.batch.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('live-call-capture', LiveCallCapture);
