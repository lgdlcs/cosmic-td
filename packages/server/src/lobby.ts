import { nanoid } from 'nanoid';
import type { Client } from './index.js';
import type { ClientMsg, ServerMsg, LobbyPlayer, GameConfig, PlayerColor } from '@ect/shared';
import { MAX_PLAYERS, MIN_PLAYERS, PLAYER_COLORS, DEFAULT_GAME_CONFIG } from '@ect/shared';
import { createGame, getGameForPlayer } from './game.js';

interface Room {
  code: string;
  clients: Client[];
  names: Map<string, string>;   // clientId → playerName
  colors: Map<string, PlayerColor>; // clientId → chosen color (Feature 3)
  ready: Set<string>;
  started: boolean;
  hostId: string;               // first player to join is host
  config: GameConfig;
}

export const rooms = new Map<string, Room>();

function generateCode(): string {
  return nanoid(6).toUpperCase();
}

function cleanupPlayerFromRooms(client: Client) {
  // Remove from any existing room
  if (client.roomCode) {
    const oldRoom = rooms.get(client.roomCode);
    if (oldRoom) {
      oldRoom.clients = oldRoom.clients.filter((c) => c.id !== client.id);
      oldRoom.names.delete(client.id);
      oldRoom.colors.delete(client.id);
      oldRoom.ready.delete(client.id);
      if (oldRoom.clients.length === 0) {
        rooms.delete(client.roomCode);
        console.log(`[cleanup] Removed empty room ${client.roomCode}`);
      }
    }
    client.roomCode = null;
  }

  // Also check all rooms in case of stale references
  for (const [code, room] of rooms.entries()) {
    const oldLength = room.clients.length;
    room.clients = room.clients.filter((c) => c.id !== client.id);
    if (room.clients.length < oldLength) {
      room.names.delete(client.id);
      room.colors.delete(client.id);
      room.ready.delete(client.id);
      if (room.clients.length === 0) {
        rooms.delete(code);
        console.log(`[cleanup] Removed stale room ${code}`);
      }
    }
  }
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
    color: room.colors.get(c.id),
  }));
  room.clients.forEach((c) => {
    const msg: ServerMsg = {
      type: 'LOBBY_UPDATE',
      players,
      roomCode: room.code,
      config: room.config,
      isHost: c.id === room.hostId,
    };
    send(c, msg);
  });
}

export function handleDisconnect(client: Client) {
  // If in a started game, kill the player
  const game = getGameForPlayer(client.id);
  if (game) {
    const player = game.state.players.find(p => p.id === client.id);
    if (player && player.alive) {
      player.hp = 0;
      player.alive = false;
      game.broadcast({ type: 'STATE_UPDATE', state: game.state });
      console.log(`[disconnect] Killed player ${client.id} in game`);
    }
  }
  // Clean up from lobby rooms
  cleanupPlayerFromRooms(client);
  // Broadcast lobby update if room still exists
  if (client.roomCode) {
    const room = rooms.get(client.roomCode);
    if (room && !room.started) broadcastLobby(room);
  }
}

export function handleMessage(client: Client, msg: ClientMsg) {
  switch (msg.type) {
    case 'JOIN_LOBBY': {
      // Clean up any previous room and any finished games
      cleanupPlayerFromRooms(client);
      
      // Also check if player has a finished game and clean it up
      const existingGame = getGameForPlayer(client.id);
      if (existingGame && existingGame.state.phase === 'gameOver') {
        console.log(`[cleanup] Player ${client.id} rejoining after game over`);
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
          colors: new Map(),
          ready: new Set(),
          started: false,
          hostId: client.id,
          config: { ...DEFAULT_GAME_CONFIG },
        };
        rooms.set(code, room);
        console.log(`[room] Created ${code}`);
      }

      room.clients.push(client);
      room.names.set(client.id, msg.name || `Player ${room.clients.length}`);
      client.roomCode = room.code;
      // If host left and rejoined or room has no host, assign
      if (!room.hostId || !room.clients.find(c => c.id === room.hostId)) {
        room.hostId = room.clients[0].id;
      }

      // Tell client their ID
      send(client, { type: 'YOUR_ID', id: client.id });
      broadcastLobby(room);
      break;
    }

    case 'SET_CONFIG': {
      if (!client.roomCode) return;
      const room = rooms.get(client.roomCode);
      if (!room || room.started) return;
      // Only host can change config
      if (client.id !== room.hostId) return;
      // Merge partial config with validation
      const c = msg.config;
      if (c.startingCredits !== undefined) room.config.startingCredits = Math.max(0, Math.min(2000, Math.round(c.startingCredits)));
      if (c.startingHp !== undefined) room.config.startingHp = Math.max(1, Math.min(500, Math.round(c.startingHp)));
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
        console.log(`[game] Starting in room ${room.code} with ${room.clients.length} players, config:`, room.config);
        createGame(room.clients, room.names, room.colors, room.config);
      }
      break;
    }

    case 'SET_COLOR': {
      // Feature 3: Lobby color picker
      if (!client.roomCode) return;
      const room = rooms.get(client.roomCode);
      if (!room || room.started) return;
      
      // Check if color is available
      const takenColors = new Set(Array.from(room.colors.values()));
      if (takenColors.has(msg.color)) {
        send(client, { type: 'ERROR', message: 'Color already taken' });
        return;
      }
      
      // Validate color
      if (!PLAYER_COLORS.includes(msg.color)) {
        send(client, { type: 'ERROR', message: 'Invalid color' });
        return;
      }
      
      room.colors.set(client.id, msg.color);
      broadcastLobby(room);
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
