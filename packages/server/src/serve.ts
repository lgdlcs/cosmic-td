/**
 * Production server: serves static client + WebSocket game server
 */
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { WebSocketServer } from 'ws';
import { handleMessage } from './lobby.js';

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_DIR = join(import.meta.dirname, '../../client/dist');

// MIME types
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// HTTP server for static files
const server = createServer((req, res) => {
  let filePath = join(CLIENT_DIR, req.url === '/' ? 'index.html' : req.url!);
  
  if (!existsSync(filePath)) {
    // SPA fallback
    filePath = join(CLIENT_DIR, 'index.html');
  }

  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

export interface Client {
  ws: import('ws').WebSocket;
  id: string;
  roomCode: string | null;
}

let clientCounter = 0;

wss.on('connection', (ws) => {
  const id = `player_${++clientCounter}`;
  const client: Client = { ws, id, roomCode: null };
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
    console.log(`[disconnect] ${id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🎮 Element Chess TD running on http://localhost:${PORT}`);
});
