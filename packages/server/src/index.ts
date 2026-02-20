import { WebSocketServer, WebSocket } from 'ws';
import { handleMessage } from './lobby.js';

const PORT = Number(process.env.PORT) || 3001;

const wss = new WebSocketServer({ port: PORT });

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
    clients.delete(ws);
    // TODO: handle disconnect in game
  });
});

console.log(`🎮 Element Chess TD server on ws://localhost:${PORT}`);
