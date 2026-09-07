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

    const connect = () => {
      ws = new WebSocket(BASE_URL.replace(/^http/, 'ws') + '/ws');

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as ServerEvent;
          callbackRef.current(parsed);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onopen = () => {
        console.log('🔌 Live WebSockets connection established');
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
