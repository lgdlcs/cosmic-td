import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { handleMessage, handleDisconnect } from './lobby.js';

const PORT = Number(process.env.PORT) || 3001;

// HTTP server for health checks (Fly.io)
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', game: 'Cosmic TD' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('🚀 Cosmic TD Server');
  }
});

const wss = new WebSocketServer({ server });

export interface Client {
  ws: WebSocket;
  id: string;
  roomCode: string | null;
}

const clients = new Map<WebSocket, Client>();

let clientCounter = 0;

wss.on('connection', (ws) => {
  const id = `player_${++clientCounter}`;
  const client: Client = { ws, id, roomCode: null };
  clients.set(ws, client);
  console.log(`[connect] ${id}`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleMessage(client, msg);
    } catch (e) {
      console.error('[parse error]', e);
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    console.log(`[disconnect] ${client.id}`);
    handleDisconnect(client);
    clients.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Cosmic TD server on 0.0.0.0:${PORT}`);
});
