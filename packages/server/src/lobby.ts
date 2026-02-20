import { nanoid } from 'nanoid';
import type { Client } from './index.js';
import type { ClientMsg, ServerMsg, LobbyPlayer } from '@ect/shared';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS } from '@ect/shared';
import { createGame, getGameForPlayer } from './game.js';

interface Room {
  code: string;
  clients: Client[];
  names: Map<string, string>;   // clientId → playerName
  ready: Set<string>;
  started: boolean;
}

const rooms = new Map<string, Room>();

function generateCode(): string {
  return nanoid(6).toUpperCase();
}

function send(client: Client, msg: ServerMsg) {
  if (client.ws.readyState === client.ws.OPEN) {
    client.ws.send(JSON.stringify(msg));
  }
}

function broadcastLobby(room: Room) {
  const players: LobbyPlayer[] = room.clients.map((c) => ({
    id: c.id,
    name: room.names.get(c.id) || 'Unknown',
    ready: room.ready.has(c.id),
  }));
  const msg: ServerMsg = { type: 'LOBBY_UPDATE', players, roomCode: room.code };
  room.clients.forEach((c) => send(c, msg));
}

export function handleMessage(client: Client, msg: ClientMsg) {
  switch (msg.type) {
    case 'JOIN_LOBBY': {
      // Clean up any previous room
      if (client.roomCode) {
        const oldRoom = rooms.get(client.roomCode);
        if (oldRoom) {
          oldRoom.clients = oldRoom.clients.filter((c) => c.id !== client.id);
          oldRoom.names.delete(client.id);
          oldRoom.ready.delete(client.id);
          if (oldRoom.clients.length === 0) rooms.delete(client.roomCode);
        }
        client.roomCode = null;
      }

      let room: Room;

      if (msg.roomCode) {
        // Join existing room
        const existing = rooms.get(msg.roomCode.toUpperCase());
        if (!existing) {
          send(client, { type: 'ERROR', message: 'Room not found' });
          return;
        }
        if (existing.started) {
          send(client, { type: 'ERROR', message: 'Game already started' });
          return;
        }
        if (existing.clients.length >= MAX_PLAYERS) {
          send(client, { type: 'ERROR', message: 'Room is full' });
          return;
        }
        room = existing;
      } else {
        // Create new room
        const code = generateCode();
        room = {
          code,
          clients: [],
          names: new Map(),
          ready: new Set(),
          started: false,
        };
        rooms.set(code, room);
        console.log(`[room] Created ${code}`);
      }

      room.clients.push(client);
      room.names.set(client.id, msg.name || `Player ${room.clients.length}`);
      client.roomCode = room.code;

      // Tell client their ID
      send(client, { type: 'YOUR_ID', id: client.id });
      broadcastLobby(room);
      break;
    }

    case 'READY': {
      if (!client.roomCode) return;
      const room = rooms.get(client.roomCode);
      if (!room || room.started) return;

      if (room.ready.has(client.id)) {
        room.ready.delete(client.id);
      } else {
        room.ready.add(client.id);
      }

      broadcastLobby(room);

      // Check if all players ready and enough players
      // In dev mode (MIN_PLAYERS = 1), allow solo games if the single player is ready
      const canStart = room.ready.size === room.clients.length &&
        (room.clients.length >= MIN_PLAYERS || (MIN_PLAYERS <= 1 && room.clients.length === 1));
        
      if (canStart) {
        room.started = true;
        console.log(`[game] Starting in room ${room.code} with ${room.clients.length} players`);
        createGame(room.clients, room.names);
      }
      break;
    }

    default: {
      // Forward game messages to the active game
      const game = getGameForPlayer(client.id);
      if (game) {
        game.handlePlayerAction(client.id, msg);
      }
      break;
    }
  }
}
