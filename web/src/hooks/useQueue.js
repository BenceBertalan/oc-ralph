import { useState, useEffect } from 'react';

/**
 * Custom hook to poll queue status from REST API
 * @param {string} baseUrl - Base URL (e.g., 'http://localhost:3000')
 * @param {number} pollInterval - Polling interval in milliseconds (default: 5000)
 * @returns {{running: Object|null, queued: Array, completed: Array, failed: Array, stats: Object|null, loading: boolean, error: string|null}}
 */
export function useQueue(baseUrl, pollInterval = 5000) {
  const [running, setRunning] = useState(null);
  const [queued, setQueued] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [failed, setFailed] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId;

    async function fetchQueue() {
      try {
        const response = await fetch(`${baseUrl}/api/queue`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (isMounted) {
          setRunning(data.running);
          setQueued(data.queued);
          setCompleted(data.completed || []);
          setFailed(data.failed || []);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error('[Queue] Failed to fetch queue status:', err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    async function fetchStats() {
      try {
        const response = await fetch(`${baseUrl}/api/queue/stats`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (isMounted) {
          setStats(data);
        }
      } catch (err) {
        console.error('[Queue] Failed to fetch queue stats:', err);
      }
    }

    async function poll() {
      await Promise.all([fetchQueue(), fetchStats()]);
      
      if (isMounted) {
        timeoutId = setTimeout(poll, pollInterval);
      }
    }

    // Initial fetch
    poll();

    // Cleanup
    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [baseUrl, pollInterval]);

  return { running, queued, completed, failed, stats, loading, error };
}
