# Fleet Monitor: ein iPhone als vernetzter Lüfter

**Live:** https://iot.farazfarid.com · Dashboard: [/dashboard](https://iot.farazfarid.com/dashboard) · Gerät: [/device](https://iot.farazfarid.com/device)

Eine kleine, vollständige IoT-Strecke: Ein iPhone wird zum Edge-Gerät eines EC-Lüfters, schickt Telemetrie per MQTT, Backend-Services werten sie aus und regeln zurück, ein Angular-Dashboard zeigt die Flotte live.

```
iPhone (/device)  ──MQTT over WSS──▶  Broker  ──▶  Angular-Dashboard (/dashboard)
 DeviceMotion 60 Hz                     │
 Edge: RMS (200 ms) + FFT (128)         ▼
                                  Backend-Services (Node)
                                   ├─ Alarm-Regel: avg 2 s, Hysterese 70 %, Haltezeiten 1 s / 5 s
                                   ├─ DCV: PI-Regler CO₂ → Sollwert
                                   └─ Simulator: Lüfter in einem Lüftungsgerät
 ◀──────── …/cmd (Sollwert, Identify, Filtertausch) ─────────┘
```

## Ausprobieren
1. https://iot.farazfarid.com öffnen, unter „Ausprobieren“ den QR-Code mit dem iPhone scannen.
2. „Sensoren starten“ tippen und Bewegung erlauben.
3. Handy flach drehen (Drehzahl) oder schütteln (Unwucht → Alarm).

Ohne iPhone: „Lüfter simulieren“ startet einen Lüfter direkt im Browser-Tab, der MQTT wie ein echtes Gerät spricht.

## Topics
Namespace `farazfarid/neo`, öffentlicher Broker `broker.emqx.io`.

| Topic | Richtung | QoS / retain | Inhalt |
| --- | --- | --- | --- |
| `fans/{id}/telemetry` | Gerät → Cloud | 0 | `{ts, rpm, vibRms, tilt, setpoint, powerW?, filterDp?, co2?}`, 5 Hz |
| `fans/{id}/spectrum` | Gerät → Cloud | 0 | `{fs, n, bins[], peakHz}`, 1 Hz |
| `fans/{id}/status` | Gerät → Cloud | 1, retained, **Last Will** | `{online, model, fw}` |
| `fans/{id}/alarm` | Backend → alle | 1, retained | `{level, vibRms, rule}` |
| `fans/{id}/dcv` | Dashboard → Backend | 1, retained | desired state `{enabled, targetCo2}` |
| `fans/{id}/cmd` | Dashboard/Backend → Gerät | 1 | `setpoint` · `identify` · `replaceFilter` |
| `backend/status` | Backend → alle | 1, retained, Last Will | Heartbeat alle 10 s |

## Digital Services
| Service | Wo | Wie |
| --- | --- | --- |
| Vibrationsanalyse | Edge | Hann-gefensterte DFT. Peak bei 1× Drehfrequenz = Unwucht, 5× = Schaufelpassierfrequenz |
| Bedarfsgeführte Lüftung | Backend | PI-Regler mit Anti-Windup. Desired state auf `…/dcv`, reported state (`setpoint`) in der Telemetrie |
| Filter-Zusetzung | Dashboard | Δp über das Affinitätsgesetz (Δp ∝ n²) normiert, lineare Regression → Restzeit bis zum Wechsel |
| Energie | Dashboard | Leistung, Wh, Anteil an Volllast nach P ∝ n³ |

## Projekt
```
web/       Angular 22: Landing (/), Dashboard (/dashboard), Edge-Gerät (/device)
backend/   services.js (Regeln, DCV, Heartbeat, Simulator), broker.js (lokaler Broker, optional)
```

```bash
cd backend && npm i && npm start            # Services + Simulator gegen den öffentlichen Broker
cd web && npm i && npx ng serve             # http://localhost:4200

# komplett offline:
cd backend && npm run broker                # MQTT :1883, WebSocket :8080
cd backend && npm run local                 # Services gegen den lokalen Broker
# Dashboard: http://localhost:4200/dashboard?broker=ws://localhost:8080
```

**Angular:** Standalone-Komponenten, Signals, `computed`, `linkedSignal`, zoneless, OnPush, lazy Routes, View Transitions. Charts sind eigene SVG-Komponenten. Ein Service hält die einzige MQTT-Verbindung der App.

## Was in Produktion anders wäre
- Eigener Broker (AWS IoT Core, Azure IoT Hub, EMQX) mit mTLS-Gerätezertifikaten und ACLs pro Topic. Der öffentliche Broker hier ist nur für die Demo.
- Payload-Schema (z. B. Sparkplug B oder JSON Schema) und Versionierung
- Time-Series-DB (Timescale/Influx) für Historie, Downsampling für lange Zeiträume
- OTA-Updates und Device-Provisioning
- Bei tausenden Geräten: Aggregation im Backend, WebWorker und Canvas statt SVG im Dashboard
