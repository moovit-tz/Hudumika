import { useEffect, useRef, useCallback } from 'react';
import type { ServerEvent } from '@hudumika/types';
import { BASE_URL } from '../lib/api.js';

export function useWebSocket(onEvent: (event: ServerEvent) => void) {
  const callbackRef = useRef(onEvent);
  
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;
    // Tracks the highest event sequence number seen so far (assigned by the
    // server's per-tenant replay buffer, lib/ws-broadcast.ts) so a
    // reconnect can ask the server to replay anything broadcast during the
    // drop instead of silently missing it. `everConnected` distinguishes
    // the very first connection (nothing to resume) from a reconnect.
    let lastSeq = 0;
    let everConnected = false;

    const connect = () => {
      ws = new WebSocket(BASE_URL.replace(/^http/, 'ws') + '/ws');

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as { seq?: number; event: ServerEvent };
          if (typeof parsed.seq === 'number') lastSeq = Math.max(lastSeq, parsed.seq);
          callbackRef.current(parsed.event);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onopen = () => {
        console.log('🔌 Live WebSockets connection established');
        if (everConnected) {
          try { ws.send(JSON.stringify({ type: 'resume', lastSeq })); } catch { /* ignore */ }
        }
        everConnected = true;
      };

      ws.onclose = () => {
        console.log('🔌 Live WebSockets closed. Reconnecting in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) {
        // Prevent reconnect loops during unmount
        ws.onclose = null;
        ws.close();
      }
      clearTimeout(reconnectTimer);
    };
  }, []);
}
