// Cloud-side "digital services" for the fan fleet. Runs as an ordinary MQTT client,
// so it works against any broker (public EMQX, local aedes, AWS IoT Core, ...).
//  1. Alarm rule: vibration RMS with moving average, hysteresis and hold times
//  2. Demand-controlled ventilation: PI controller CO₂ -> fan setpoint
//  3. Heartbeat with Last Will so dashboards know whether the backend is up
import mqtt from 'mqtt'
import { BROKER, ROOT, fanTopic } from './config.js'

const statusTopic = `${ROOT}/backend/status`
const client = mqtt.connect(BROKER, {
  clientId: `farazfarid-neo-backend-${Math.random().toString(16).slice(2, 6)}`,
  will: { topic: statusTopic, payload: JSON.stringify({ online: false }), qos: 1, retain: true },
})

client.on('connect', () => {
  console.log(`connected to ${BROKER} as ${client.options.clientId}, topic root ${ROOT}`)
  client.subscribe([fanTopic('+', 'telemetry'), fanTopic('+', 'dcv')], { qos: 1 })
  heartbeat()
})
client.on('error', e => console.error('mqtt error', e.message))

const heartbeat = () => client.publish(statusTopic, JSON.stringify({
  online: true, ts: Date.now(), services: ['alarm-rule', 'dcv'],
}), { qos: 1, retain: true })
setInterval(heartbeat, 10_000)

client.on('message', (topic, payload) => {
  const [, id, kind] = topic.slice(ROOT.length + 1).split('/')
  let msg
  try { msg = JSON.parse(payload.toString()) } catch { return }
  if (kind === 'telemetry' && typeof msg.vibRms === 'number') {
    alarmRule(id, msg)
    const s = dcv.get(id)
    if (s && typeof msg.co2 === 'number') s.co2 = msg.co2
  }
  if (kind === 'dcv') {
    const prev = dcv.get(id)
    dcv.set(id, { integral: prev?.integral ?? 0, co2: prev?.co2, enabled: !!msg.enabled, targetCo2: Number(msg.targetCo2) || 800 })
    console.log(`[dcv] ${id}: ${msg.enabled ? `auto, target ${msg.targetCo2} ppm` : 'manual'}`)
  }
})

// --- 1. Alarm rule ----------------------------------------------------------------
const LEVELS = ['ok', 'warning', 'critical']
const THRESHOLDS = [0, 1.5, 4.0] // m/s² RMS to enter warning / critical
const HYSTERESIS = 0.7 // must drop below 70 % of the threshold to clear
const RAISE_MS = 1000 // condition must hold this long before raising
const CLEAR_MS = 5000 // ... and this long before clearing
const WINDOW = 10 // samples at 5 Hz = 2 s moving average
const alarms = new Map()
const levelFor = (v, factor = 1) => THRESHOLDS.findLastIndex(th => v >= th * factor)

function alarmRule(id, t) {
  const s = alarms.get(id) ?? { level: -1, window: [], candidate: 0, since: 0 }
  alarms.set(id, s)
  s.window.push(t.vibRms); if (s.window.length > WINDOW) s.window.shift()
  const avg = s.window.reduce((a, b) => a + b, 0) / s.window.length

  const enter = levelFor(avg) // higher level reached?
  const stay = levelFor(avg, HYSTERESIS) // still above the clear band?
  const now = Date.now()
  let target = s.level, hold = 0
  if (s.level < 0) target = enter
  else if (enter > s.level) { target = enter; hold = RAISE_MS }
  else if (stay < s.level) { target = stay; hold = CLEAR_MS }

  if (target === s.level) { s.candidate = target; s.since = now; return }
  if (target !== s.candidate) { s.candidate = target; s.since = now }
  if (now - s.since < hold) return

  s.level = target
  const level = LEVELS[target]
  client.publish(fanTopic(id, 'alarm'), JSON.stringify({
    ts: now, level, vibRms: +avg.toFixed(3), rule: `avg2s(vibRms) ≥ ${THRESHOLDS[target]} for ${hold / 1000}s`,
  }), { qos: 1, retain: true })
  console.log(`[rule] ${id}: ${level} (vib ${avg.toFixed(2)} m/s² avg)`)
}

// --- 2. Demand-controlled ventilation ----------------------------------------------
const dcv = new Map() // id -> { enabled, targetCo2, integral, co2 }
const RPM_MIN = 300, RPM_MAX = 3000, KP = 4, KI = 0.4, BASE = 1000

setInterval(() => {
  for (const [id, s] of dcv) {
    if (!s.enabled || s.co2 == null) continue
    const error = s.co2 - s.targetCo2 // ppm above target -> more air
    const unclamped = BASE + KP * error + KI * (s.integral + error)
    if (unclamped > RPM_MIN && unclamped < RPM_MAX) s.integral += error // anti-windup
    const rpm = Math.round(Math.min(RPM_MAX, Math.max(RPM_MIN, BASE + KP * error + KI * s.integral)) / 10) * 10
    client.publish(fanTopic(id, 'cmd'), JSON.stringify({ type: 'setpoint', rpm, source: 'dcv' }), { qos: 1 })
  }
}, 1000)

// The simulated fan runs in the same process unless SIM=0.
if (process.env.SIM !== '0') await import('./simulator.js')

process.on('SIGINT', () => client.publish(statusTopic, JSON.stringify({ online: false }), { qos: 1, retain: true }, () => process.exit()))
