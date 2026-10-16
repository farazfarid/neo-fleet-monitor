// Optional local broker for offline development: MQTT on :1883, MQTT over WebSocket on :8080.
// Dashboard: http://localhost:4200/dashboard?broker=ws://localhost:8080
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { Aedes } from 'aedes'
import { WebSocketServer, createWebSocketStream } from 'ws'

const aedes = await Aedes.createBroker()
createTcpServer(aedes.handle).listen(1883, () => console.log('MQTT      mqtt://localhost:1883'))
const http = createServer()
new WebSocketServer({ server: http }).on('connection', (ws, req) => aedes.handle(createWebSocketStream(ws), req))
http.listen(8080, () => console.log('MQTT/WS   ws://localhost:8080'))
aedes.on('client', c => console.log(`+ ${c.id}`))
aedes.on('clientDisconnect', c => console.log(`- ${c.id}`))
