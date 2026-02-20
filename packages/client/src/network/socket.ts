import type { ClientMsg, ServerMsg } from '@ect/shared';

type MsgHandler = (msg: ServerMsg) => void;

class GameSocket {
  private ws: WebSocket | null = null;
  private handlers: MsgHandler[] = [];
  private url: string;
  private connected = false;

  constructor() {
    const host = window.location.hostname || 'localhost';
    this.url = `ws://${host}:3001`;
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Force a fresh connection (close existing if any) */
  reconnect(): Promise<void> {
    if (this.ws) {
      this.ws.onclose = null; // prevent log spam
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
    return this.connect();
  }

  connect(): Promise<void> {
    if (this.isConnected()) return Promise.resolve();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[ws] Connected');
        this.connected = true;
        resolve();
      };

      this.ws.onclose = () => {
        console.log('[ws] Disconnected');
        this.connected = false;
      };

      this.ws.onerror = (e) => {
        console.error('[ws] Error', e);
        this.connected = false;
        reject(e);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: ServerMsg = JSON.parse(event.data);
          this.handlers.forEach((h) => h(msg));
        } catch (e) {
          console.error('[ws] Parse error', e);
        }
      };
    });
  }

  send(msg: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MsgHandler) {
    this.handlers.push(handler);
  }

  offMessage(handler: MsgHandler) {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  /** Remove all handlers (scene transition cleanup) */
  clearHandlers() {
    this.handlers = [];
  }
}

export const socket = new GameSocket();
