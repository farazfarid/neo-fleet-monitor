// Broker selection: a public broker by default so the hosted demo works with zero infrastructure.
// Override for local development with ?broker=ws://localhost:8080 (remembered for the session).
const KEY = 'fleet.broker';
const fromQuery = new URLSearchParams(location.search).get('broker');
if (fromQuery) sessionStorage.setItem(KEY, fromQuery);

export const BROKER_URL = sessionStorage.getItem(KEY) ?? 'wss://broker.emqx.io:8084/mqtt';
export const ROOT = 'farazfarid/neo';
export const fanTopic = (id: string, kind: string) => `${ROOT}/fans/${id}/${kind}`;
export const clientId = (role: string) => `farazfarid-neo-${role}-${Math.random().toString(16).slice(2, 8)}`;
