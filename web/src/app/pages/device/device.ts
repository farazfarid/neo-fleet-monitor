import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import mqtt, { type MqttClient } from 'mqtt';
import { BROKER_URL, clientId, fanTopic } from '../../core/config';
import { FanGlyph } from '../../shared/fan-glyph';

type Phase = 'idle' | 'running' | 'denied' | 'unsupported';

/**
 * Turns the phone into an edge device: samples DeviceMotion at ~60 Hz, aggregates to
 * 5 Hz telemetry (RMS), computes an FFT once per second and listens for commands.
 */
@Component({
  selector: 'app-device',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink, FanGlyph],
  templateUrl: './device.html',
  styleUrl: './device.css',
  host: { '[class.flash]': 'flash()' },
})
export class DevicePage {
  protected readonly id = localStorage.getItem('fleet.deviceId') ?? `iphone-${Math.random().toString(36).slice(2, 6)}`;
  protected readonly phase = signal<Phase>('idle');
  protected readonly connected = signal(false);
  protected readonly rpm = signal(0);
  protected readonly vib = signal(0);
  protected readonly tilt = signal(0);
  protected readonly peakHz = signal<number | null>(null);
  protected readonly alarm = signal<'ok' | 'warning' | 'critical' | null>(null);
  protected readonly setpoint = signal<{ rpm: number; dcv: boolean } | null>(null);
  protected readonly flash = signal(false);
  protected readonly sent = signal(0);

  private client?: MqttClient;
  private timers: ReturnType<typeof setInterval>[] = [];
  // aggregation state
  private sq = 0; private n = 0; private rot = 0; private rpmSmooth = 0;
  private readonly N = 128; private raw = new Float32Array(128); private head = 0; private filled = 0;
  private intervals: number[] = [];

  constructor() {
    localStorage.setItem('fleet.deviceId', this.id);
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected async start(): Promise<void> {
    const DME = (window as any).DeviceMotionEvent;
    if (!DME) { this.phase.set('unsupported'); return; }
    if (typeof DME.requestPermission === 'function') {
      try {
        if ((await DME.requestPermission()) !== 'granted') { this.phase.set('denied'); return; }
      } catch { this.phase.set('denied'); return; }
    }
    this.connect();
    window.addEventListener('devicemotion', this.onMotion);
    this.timers.push(setInterval(() => this.tick(), 200), setInterval(() => this.spectrum(), 1000));
    this.phase.set('running');
  }

  private connect(): void {
    const base = (k: string) => fanTopic(this.id, k);
    this.client = mqtt.connect(BROKER_URL, {
      clientId: clientId(this.id),
      reconnectPeriod: 1000,
      will: { topic: base('status'), payload: JSON.stringify({ online: false }), qos: 1, retain: true },
    });
    this.client.on('connect', () => {
      this.connected.set(true);
      this.client!.publish(base('status'), JSON.stringify({ online: true, model: 'iPhone', fw: 'web-1.0' }), { qos: 1, retain: true });
      this.client!.subscribe([base('cmd'), base('alarm')], { qos: 1 });
    });
    this.client.on('close', () => this.connected.set(false));
    this.client.on('message', (topic, buf) => {
      let msg: any;
      try { msg = JSON.parse(new TextDecoder().decode(buf)); } catch { return; }
      if (topic.endsWith('/alarm')) this.alarm.set(msg.level);
      else if (msg.type === 'setpoint' && typeof msg.rpm === 'number') this.setpoint.set({ rpm: msg.rpm, dcv: msg.source === 'dcv' });
      else if (msg.type === 'identify') this.identify();
    });
  }

  private readonly onMotion = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    if (a?.x != null && a.y != null && a.z != null) {
      const m2 = a.x * a.x + a.y * a.y + a.z * a.z;
      this.sq += m2; this.n++;
      this.raw[this.head] = Math.sqrt(m2);
      this.head = (this.head + 1) % this.N;
      this.filled = Math.min(this.N, this.filled + 1);
      if (e.interval) { this.intervals.push(e.interval); if (this.intervals.length > 60) this.intervals.shift(); }
    }
    if (e.rotationRate?.alpha != null) this.rot = e.rotationRate.alpha; // deg/s around z
    const g = e.accelerationIncludingGravity;
    if (g?.x != null && g.y != null && g.z != null) {
      this.tilt.set(Math.acos(Math.min(1, Math.abs(g.z) / Math.hypot(g.x, g.y, g.z))) * 180 / Math.PI);
    }
  };

  /** 200 ms window → one telemetry message (edge aggregation instead of raw 60 Hz). */
  private tick(): void {
    const vibRms = this.n ? Math.sqrt(this.sq / this.n) : 0;
    this.sq = 0; this.n = 0;
    this.rpmSmooth = this.rpmSmooth * 0.7 + (Math.abs(this.rot) / 6) * 0.3; // deg/s → rpm
    this.rpm.set(Math.round(this.rpmSmooth));
    this.vib.set(vibRms);
    if (!this.client?.connected) return;
    this.client.publish(fanTopic(this.id, 'telemetry'), JSON.stringify({
      ts: Date.now(), rpm: this.rpm(), vibRms: +vibRms.toFixed(3), tilt: +this.tilt().toFixed(1), setpoint: this.setpoint()?.rpm ?? null,
    }));
    this.sent.update(v => v + 1);
  }

  /** Hann-windowed DFT over the last 128 samples, published once per second. */
  private spectrum(): void {
    if (this.filled < this.N || !this.client?.connected || !this.intervals.length) return;
    const iv = this.intervals.reduce((a, b) => a + b, 0) / this.intervals.length;
    const fs = iv > 1 ? 1000 / iv : 1 / iv; // iOS reports ms, older engines seconds
    const N = this.N, x = new Float32Array(N);
    let mean = 0;
    for (let i = 0; i < N; i++) { x[i] = this.raw[(this.head + i) % N]; mean += x[i] / N; }
    for (let i = 0; i < N; i++) x[i] = (x[i] - mean) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
    const bins: number[] = [];
    let peak = 1;
    for (let k = 0; k < N / 2; k++) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i++) { const w = (2 * Math.PI * k * i) / N; re += x[i] * Math.cos(w); im -= x[i] * Math.sin(w); }
      bins.push(+((4 * Math.hypot(re, im)) / N).toFixed(4));
      if (k > 0 && bins[k] > bins[peak]) peak = k;
    }
    bins[0] = 0;
    const peakHz = +((peak * fs) / N).toFixed(2);
    this.peakHz.set(peakHz);
    this.client.publish(fanTopic(this.id, 'spectrum'), JSON.stringify({ ts: Date.now(), fs: +fs.toFixed(1), n: N, bins, peakHz }));
  }

  private identify(): void {
    let i = 0;
    const t = setInterval(() => { this.flash.update(v => !v); if (++i >= 6) { clearInterval(t); this.flash.set(false); } }, 200);
  }

  protected stop(): void {
    window.removeEventListener('devicemotion', this.onMotion);
    this.timers.forEach(clearInterval);
    this.timers = [];
    const c = this.client;
    c?.publish(fanTopic(this.id, 'status'), JSON.stringify({ online: false }), { qos: 1, retain: true }, () => c.end());
    this.client = undefined;
    this.connected.set(false);
    if (this.phase() === 'running') this.phase.set('idle');
  }
}
