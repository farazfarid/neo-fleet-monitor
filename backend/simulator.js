// Simulated EC fan in an air handling unit, so the fleet has more than one device.
// Physics (simplified fan affinity laws): Δp ∝ n², P ∝ n³. Time runs ~60× faster for the filter.
import mqtt from 'mqtt'
import { BROKER, fanTopic } from './config.js'

const id = process.env.SIM_ID ?? 'sim-ahu-01'
const client = mqtt.connect(BROKER, {
  clientId: `farazfarid-neo-${id}-${Math.random().toString(16).slice(2, 6)}`,
  will: { topic: fanTopic(id, 'status'), payload: JSON.stringify({ online: false }), qos: 1, retain: true },
})

const DT = 0.2 // s
const RPM_REF = 1500, DP_REF = 120, P_REF = 180 // at reference speed with a clean filter
let setpoint = 1200, rpm = 0, t = 0
let clog = 1.0 // filter resistance factor: 1 = new, 2.5 = replace
let co2 = 650, occupancy = 8 // room
let imbalanceUntil = 0
let cloggedSince = 0 // a technician swaps a fully clogged filter after a minute

client.on('connect', () => {
  client.publish(fanTopic(id, 'status'), JSON.stringify({ online: true, model: 'Simulated EC fan (AHU)', fw: '2.4.1' }), { qos: 1, retain: true })
  client.subscribe(fanTopic(id, 'cmd'))
  console.log(`${id} connected`)
})
client.on('message', (_, buf) => {
  const cmd = JSON.parse(buf.toString())
  if (cmd.type === 'setpoint') setpoint = cmd.rpm
  if (cmd.type === 'replaceFilter') clog = 1.0
  if (cmd.type === 'identify') console.log('*** identify ***')
  if (cmd.source !== 'dcv') console.log('cmd', cmd)
})

const noise = (a) => (Math.random() - 0.5) * 2 * a

setInterval(() => {
  t += DT
  rpm += (setpoint - rpm) * 0.08 // first-order ramp towards setpoint
  const n = rpm / RPM_REF

  // Filter slowly clogs (accelerated), raising pressure drop and power
  clog = Math.min(2.6, clog + 0.004 * DT)
  if (clog >= 2.6) { cloggedSince ||= t; if (t - cloggedSince > 60) { clog = 1.0; cloggedSince = 0 } }
  const filterDp = DP_REF * clog * n * n + noise(1.5)
  const powerW = P_REF * n ** 3 * (0.8 + 0.2 * clog) + noise(0.5)

  // Room CO₂: people produce, airflow (∝ rpm) removes towards outdoor 420 ppm
  if (Math.random() < DT / 25) occupancy = Math.max(0, Math.min(18, occupancy + Math.round(noise(6))))
  co2 += (occupancy * 3 - (rpm / 3000) * 0.15 * (co2 - 420)) * DT

  // Mechanical imbalance every ~90 s for 8 s
  if (t % 90 > 82 && imbalanceUntil < t) imbalanceUntil = t + 8
  const imbalance = t < imbalanceUntil ? 4.5 + Math.random() : 0
  const vibRms = 0.15 + n * 0.15 + imbalance + Math.random() * 0.05

  client.publish(fanTopic(id, 'telemetry'), JSON.stringify({
    ts: Date.now(), rpm: Math.round(rpm), vibRms: +vibRms.toFixed(3), tilt: 0.4, setpoint,
    powerW: +powerW.toFixed(1), filterDp: +filterDp.toFixed(1), co2: Math.round(co2), occupancy,
  }))

  // Vibration spectrum once per second: 1× rotation (imbalance), 2× (misalignment), 5× blade pass
  if (Math.round(t / DT) % 5 === 0) {
    const fs = 400, N = 512, f1 = rpm / 60
    const bins = Array.from({ length: N / 2 }, (_, k) => {
      const f = (k * fs) / N
      const peak = (fc, a) => a * Math.exp(-(((f - fc) / 0.8) ** 2))
      return +(Math.abs(0.01 + noise(0.008)) + peak(f1, 0.05 + (imbalance ? 1.6 : 0)) + peak(2 * f1, 0.03) + peak(5 * f1, 0.06 * n)).toFixed(4)
    })
    bins[0] = 0
    const peakK = bins.indexOf(Math.max(...bins))
    client.publish(fanTopic(id, 'spectrum'), JSON.stringify({ ts: Date.now(), fs, n: N, bins, peakHz: +((peakK * fs) / N).toFixed(2) }))
  }
}, DT * 1000)

