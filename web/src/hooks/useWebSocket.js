import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to manage WebSocket connection for real-time log streaming
 * @param {string} url - WebSocket URL (e.g., 'ws://localhost:3000/ws')
 * @returns {{logs: Array, isConnected: boolean, error: string|null}}
 */
export function useWebSocket(url) {
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const ws = useRef(null);
  const reconnectTimeout = useRef(null);

  useEffect(() => {
    let isMounted = true;

    function connect() {
      try {
        const websocket = new WebSocket(url);
        ws.current = websocket;

        websocket.onopen = () => {
          if (isMounted) {
            console.log('[WebSocket] Connected');
            setIsConnected(true);
            setError(null);
          }
        };

        websocket.onmessage = (event) => {
          if (!isMounted) return;
          
          try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'init') {
              // Initial buffer load
              console.log('[WebSocket] Received initial buffer:', data.logs.length, 'logs');
              setLogs(data.logs);
            } else if (data.type === 'log') {
              // New log entry
              setLogs(prev => [...prev, data.log]);
            }
          } catch (err) {
            console.error('[WebSocket] Failed to parse message:', err);
          }
        };

        websocket.onerror = (event) => {
          console.error('[WebSocket] Error:', event);
          if (isMounted) {
            setError('WebSocket connection error');
          }
        };

        websocket.onclose = (event) => {
          console.log('[WebSocket] Disconnected:', event.code, event.reason);
          if (isMounted) {
            setIsConnected(false);
            
            // Auto-reconnect after 3 seconds
            reconnectTimeout.current = setTimeout(() => {
              if (isMounted) {
                console.log('[WebSocket] Attempting to reconnect...');
                connect();
              }
            }, 3000);
          }
        };

      } catch (err) {
        console.error('[WebSocket] Failed to create connection:', err);
        if (isMounted) {
          setError('Failed to establish WebSocket connection');
        }
      }
    }

    connect();

    // Cleanup
    return () => {
      isMounted = false;
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [url]);

  return { logs, isConnected, error };
}
