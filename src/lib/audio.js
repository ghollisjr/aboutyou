export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.buffers = new Map();
    this.playing = new Set();
    this.initialized = false;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.initialized = true;
  }

  async load(name, url) {
    if (!this.ctx) this.init();
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`AudioManager: failed to fetch ${url} (${res.status})`);
        return;
      }
      const buf = await res.arrayBuffer();
      const audio = await this.ctx.decodeAudioData(buf);
      this.buffers.set(name, audio);
    } catch (e) {
      console.warn(`AudioManager: failed to load "${name}" from ${url}`, e);
    }
  }

  async loadAll(manifest) {
    const entries = Object.entries(manifest);
    await Promise.all(entries.map(([name, url]) => this.load(name, url)));
  }

  play(name, { volume = 1, loop = false, fadeIn = 0, onended = null } = {}) {
    if (!this.ctx || !this.buffers.has(name)) return null;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers.get(name);
    source.loop = loop;

    const gain = this.ctx.createGain();
    gain.connect(this.masterGain);
    source.connect(gain);

    const now = this.ctx.currentTime;
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + fadeIn);
    } else {
      gain.gain.setValueAtTime(volume, now);
    }

    const handle = { source, gain, name };
    this.playing.add(handle);

    source.onended = () => {
      this.playing.delete(handle);
      if (onended) onended(handle);
    };

    source.start(0);
    return handle;
  }

  stop(handle, { fadeOut = 0 } = {}) {
    if (!handle || !this.playing.has(handle)) return;

    const { source, gain } = handle;
    const now = this.ctx.currentTime;

    if (fadeOut > 0) {
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeOut);
      source.stop(now + fadeOut);
    } else {
      source.stop();
    }

    this.playing.delete(handle);
  }

  setVolume(handle, volume, rampTime = 0.05) {
    if (!handle || !this.playing.has(handle)) return;
    const now = this.ctx.currentTime;
    handle.gain.gain.setTargetAtTime(volume, now, rampTime);
  }

  setMasterVolume(volume) {
    if (!this.masterGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(volume, now, 0.05);
  }

  stopAll() {
    for (const handle of this.playing) {
      handle.source.stop();
    }
    this.playing.clear();
  }

  dispose() {
    this.stopAll();
    this.buffers.clear();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.initialized = false;
  }
}
