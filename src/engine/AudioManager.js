import * as THREE from 'three';

export class AudioManager {
  constructor(camera) {
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);

    this.pool = {};
    this.masterVolume = 0.7;
    this.enabled = true;
  }

  _getOrCreatePool(name) {
    if (!this.pool[name]) {
      this.pool[name] = [];
    }
    return this.pool[name];
  }

  _getFromPool(name) {
    const pool = this._getOrCreatePool(name);
    let source = pool.find(s => !s.isPlaying);
    if (!source) {
      source = new THREE.Audio(this.listener);
      pool.push(source);
    }
    return source;
  }

  play(name, options = {}) {
    if (!this.enabled) return;
    const source = this._getFromPool(name);
    // In a full implementation, load actual audio buffers
    // For now use oscillator-based sounds as procedural audio
    source.setVolume((options.volume ?? 1) * this.masterVolume);
    // We'll use oscillator-based generation for now
    return source;
  }

  playProcedural(type, options = {}) {
    // Creates procedural sounds using oscillators
    const ctx = this.listener.context;
    if (!ctx || !this.enabled) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const vol = (options.volume ?? 1) * this.masterVolume * 0.3;
    const duration = options.duration ?? 0.15;

    switch (type) {
      case 'gunshot':
        // Noise burst for gunshot
        this._playNoiseBurst(ctx, duration * 0.2, vol * 0.5, 2000);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
        break;

      case 'impact':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol * 0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
        break;

      case 'footstep':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + duration);
        gain.gain.setValueAtTime(vol * 0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
        break;

      case 'reload':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.setValueAtTime(300, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(150, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        // Add second click
        setTimeout(() => {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(800, ctx.currentTime + 0.15);
          gain2.gain.setValueAtTime(vol * 0.2, ctx.currentTime + 0.15);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc2.start(ctx.currentTime + 0.15);
          osc2.stop(ctx.currentTime + 0.3);
        }, 150);
        break;

      case 'explosion':
        this._playNoiseBurst(ctx, 0.4, vol, 4000);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(vol * 0.6, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.8);
        break;

      case 'enemy_hit':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        break;

      case 'enemy_death':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
        break;
    }
  }

  _playNoiseBurst(ctx, duration, volume, maxFreq = 4000) {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + duration + 0.05);
  }

  setMasterVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
  }
}
