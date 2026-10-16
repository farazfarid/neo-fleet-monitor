import { Injectable, computed, signal } from '@angular/core';
import mqtt, { type MqttClient } from 'mqtt';
import { BROKER_URL, ROOT, clientId, fanTopic } from './config';

export interface Telemetry {
  ts: number; rpm: number; vibRms: number; tilt: number;
  /** reported state: what the device is actually running at */
  setpoint?: number | null;
  powerW?: number; filterDp?: number; co2?: number; occupancy?: number;
}
export interface Spectrum { ts: number; fs: number; n: number; bins: number[]; peakHz: number }
export interface DcvConfig { enabled: boolean; targetCo2: number }
export type AlarmLevel = 'ok' | 'warning' | 'critical';
export interface Alarm { ts: number; level: AlarmLevel; vibRms: number; rule: string }
export interface Device {
  id: string;
  online: boolean;
  model?: string;
  fw?: string;
  last?: Telemetry;
  history: Telemetry[];
  alarm?: Alarm;
  spectrum?: Spectrum;
  /** desired state for the DCV digital service */
  dcv?: DcvConfig;
  energyWh: number;
}
export interface LogEntry { ts: number; deviceId: string; text: string; level: AlarmLevel | 'info' }

const HISTORY = 150; // 30 s at 5 Hz
const STALE_MS = 3000;

/** Single MQTT connection for the app; exposes the fleet as signals. */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private client?: MqttClient;
  private readonly _devices = signal<Record<string, Device>>({});
  private readonly _log = signal<LogEntry[]>([]);
  private readonly now = signal(Date.now());

  readonly connected = signal(false);
  readonly msgRate = signal(0);
  readonly log = this._log.asReadonly();
  private readonly backend = signal<{ online: boolean; ts?: number } | null>(null);
  /** Heartbeat every 10 s with a Last Will, so a stale or crashed backend shows up as offline. */
  readonly backendOnline = computed(() => {
    const b = this.backend();
    return !!b?.online && !!b.ts && this.now() - b.ts < 30_000;
  });
  /** Retained status messages on a public broker outlive old devices; only show fans we heard from. */
  readonly devices = computed(() =>
    Object.values(this._devices())
      .filter(d => d.last || d.online)
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
  /** Online = broker status says so AND we heard from it recently. */
  readonly isLive = (d: Device) => d.online && !!d.last && this.now() - d.last.ts < STALE_MS;
  readonly onlineCount = computed(() => this.devices().filter(this.isLive).length);
  readonly activeAlarms = computed(() => this.devices().filter(d => d.alarm && d.alarm.level !== 'ok').length);

  constructor() {
    let count = 0;
    setInterval(() => { this.now.set(Date.now()); this.msgRate.set(count); count = 0; }, 1000);
    this.onMessage = (topic, payload) => { count++; this.handle(topic, payload); };
  }

  private onMessage: (topic: string, payload: Uint8Array) => void;

  start(): void {
    if (this.client) return;
    this.client = mqtt.connect(BROKER_URL, { clientId: clientId('dashboard'), reconnectPeriod: 2000 });
    this.client.on('connect', () => {
      this.connected.set(true);
      this.client!.subscribe([fanTopic('+', '+'), `${ROOT}/backend/status`], { qos: 1 });
    });
    this.client.on('close', () => this.connected.set(false));
    this.client.on('message', (t, p) => this.onMessage(t, p));
  }

  sendCommand(deviceId: string, cmd: object): void {
    this.client?.publish(fanTopic(deviceId, 'cmd'), JSON.stringify(cmd), { qos: 1 });
    this.addLog(deviceId, `Command → ${JSON.stringify(cmd)}`, 'info');
  }

  /** Desired state for the DCV service, retained so the backend picks it up after a restart. */
  setDcv(deviceId: string, cfg: DcvConfig): void {
    this.client?.publish(fanTopic(deviceId, 'dcv'), JSON.stringify(cfg), { qos: 1, retain: true });
  }

  private handle(topic: string, payload: Uint8Array): void {
    let msg: any;
    try { msg = JSON.parse(new TextDecoder().decode(payload)); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (topic === `${ROOT}/backend/status`) { this.backend.set(msg); return; }
    const [, id, kind] = topic.slice(ROOT.length + 1).split('/');
    if (!id || !/^[\w-]{1,40}$/.test(id)) return;

    this._devices.update(all => {
      const d: Device = all[id] ?? { id, online: false, history: [], energyWh: 0 };
      switch (kind) {
        case 'telemetry': {
          const history = d.history.length >= HISTORY ? [...d.history.slice(1), msg] : [...d.history, msg];
          const dt = d.last ? Math.min(5, (msg.ts - d.last.ts) / 1000) : 0;
          const energyWh = d.energyWh + ((msg.powerW ?? 0) * dt) / 3600;
          return { ...all, [id]: { ...d, online: true, last: msg, history, energyWh } };
        }
        case 'spectrum':
          return { ...all, [id]: { ...d, spectrum: msg } };
        case 'dcv': {
          if (d.dcv?.enabled !== msg.enabled) this.addLog(id, msg.enabled ? `DCV aktiv (Ziel ${msg.targetCo2} ppm)` : 'DCV aus, manueller Betrieb', 'info');
          return { ...all, [id]: { ...d, dcv: msg } };
        }
        case 'status':
          if (d.online !== msg.online) this.addLog(id, msg.online ? 'online' : 'offline (Last Will)', 'info');
          return { ...all, [id]: { ...d, online: msg.online, model: msg.model ?? d.model, fw: msg.fw ?? d.fw } };
        case 'alarm':
          if (d.alarm?.level !== msg.level) this.addLog(id, `Alarm: ${msg.level} (${msg.vibRms?.toFixed(2)} m/s²)`, msg.level);
          return { ...all, [id]: { ...d, alarm: msg } };
        default:
          return all;
      }
    });
  }

  private addLog(deviceId: string, text: string, level: LogEntry['level']): void {
    queueMicrotask(() => this._log.update(l => [{ ts: Date.now(), deviceId, text, level }, ...l].slice(0, 50)));
  }
}
