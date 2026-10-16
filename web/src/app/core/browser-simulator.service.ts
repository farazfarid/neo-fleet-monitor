import { Injectable, signal } from '@angular/core';
import mqtt, { type MqttClient } from 'mqtt';
import { BROKER_URL, clientId, fanTopic } from './config';

/**
 * A simulated fan that runs in this browser tab and talks MQTT like a real device,
 * so visitors without an iPhone still get a fan in the fleet. Same model as backend/simulator.js.
 */
@Injectable({ providedIn: 'root' })
export class BrowserSimulator {
  readonly running = signal(false);
  readonly deviceId = signal(sessionStorage.getItem('fleet.simId') ?? `browser-${Math.random().toString(36).slice(2, 6)}`);
  private client?: MqttClient;
  private timer?: ReturnType<typeof setInterval>;

  start(): void {
    if (this.running()) return;
    const id = this.deviceId();
    sessionStorage.setItem('fleet.simId', id);
    const DT = 0.2, RPM_REF = 1500, DP_REF = 120, P_REF = 180;
    let setpoint = 1400, rpm = 0, t = 0, clog = 1.0, co2 = 700, occupancy = 6, imbalanceUntil = 0, cloggedSince = 0;
    const noise = (a: number) => (Math.random() - 0.5) * 2 * a;

    this.client = mqtt.connect(BROKER_URL, {
      clientId: clientId(id),
      will: { topic: fanTopic(id, 'status'), payload: JSON.stringify({ online: false }), qos: 1, retain: true },
    });
    this.client.on('connect', () => {
      this.client!.publish(fanTopic(id, 'status'), JSON.stringify({ online: true, model: 'Browser-Simulation', fw: 'web' }), { qos: 1, retain: true });
      this.client!.subscribe(fanTopic(id, 'cmd'), { qos: 1 });
    });
    this.client.on('message', (_t, buf) => {
      try {
        const cmd = JSON.parse(new TextDecoder().decode(buf));
        if (cmd.type === 'setpoint' && typeof cmd.rpm === 'number') setpoint = Math.max(0, Math.min(3000, cmd.rpm));
        if (cmd.type === 'replaceFilter') clog = 1.0;
      } catch { /* ignore malformed commands */ }
    });

    this.timer = setInterval(() => {
      if (!this.client?.connected) return;
      t += DT;
      rpm += (setpoint - rpm) * 0.08;
      const n = rpm / RPM_REF;
      clog = Math.min(2.6, clog + 0.004 * DT);
      if (clog >= 2.6) { cloggedSince ||= t; if (t - cloggedSince > 60) { clog = 1.0; cloggedSince = 0; } }
      if (Math.random() < DT / 25) occupancy = Math.max(0, Math.min(18, occupancy + Math.round(noise(6))));
      co2 += (occupancy * 3 - (rpm / 3000) * 0.15 * (co2 - 420)) * DT;
      if (t % 70 > 62 && imbalanceUntil < t) imbalanceUntil = t + 8;
      const imbalance = t < imbalanceUntil ? 4.5 + Math.random() : 0;

      this.client.publish(fanTopic(id, 'telemetry'), JSON.stringify({
        ts: Date.now(), rpm: Math.round(rpm), vibRms: +(0.15 + n * 0.15 + imbalance + Math.random() * 0.05).toFixed(3), tilt: 0,
        setpoint, powerW: +(P_REF * n ** 3 * (0.8 + 0.2 * clog)).toFixed(1), filterDp: +(DP_REF * clog * n * n + noise(1.5)).toFixed(1),
        co2: Math.round(co2), occupancy,
      }));

      if (Math.round(t / DT) % 5 === 0) {
        const fs = 400, N = 512, f1 = rpm / 60;
        const peak = (f: number, fc: number, a: number) => a * Math.exp(-(((f - fc) / 0.8) ** 2));
        const bins = Array.from({ length: N / 2 }, (_, k) => {
          const f = (k * fs) / N;
          return +(Math.abs(0.01 + noise(0.008)) + peak(f, f1, 0.05 + (imbalance ? 1.6 : 0)) + peak(f, 2 * f1, 0.03) + peak(f, 5 * f1, 0.06 * n)).toFixed(4);
        });
        bins[0] = 0;
        const k = bins.indexOf(Math.max(...bins));
        this.client.publish(fanTopic(id, 'spectrum'), JSON.stringify({ ts: Date.now(), fs, n: N, bins, peakHz: +((k * fs) / N).toFixed(2) }));
      }
    }, DT * 1000);
    this.running.set(true);
  }

  stop(): void {
    clearInterval(this.timer);
    const c = this.client;
    c?.publish(fanTopic(this.deviceId(), 'status'), JSON.stringify({ online: false }), { qos: 1, retain: true }, () => c.end());
    this.client = undefined;
    this.running.set(false);
  }
}
