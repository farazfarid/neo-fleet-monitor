// Shared settings. The default is a public broker, so the deployed dashboard and the
// backend find each other without any infrastructure. Use BROKER=mqtt://localhost:1883 with broker.js locally.
export const BROKER = process.env.BROKER ?? 'mqtts://broker.emqx.io:8883'
export const ROOT = process.env.TOPIC_ROOT ?? 'farazfarid/neo'
export const fanTopic = (id, kind) => `${ROOT}/fans/${id}/${kind}`
