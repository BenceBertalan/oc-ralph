import React, { useMemo } from 'react';
import { StatusBar } from './components/StatusBar';
import { QueueStatus } from './components/QueueStatus';
import { HierarchicalLogView } from './components/HierarchicalLogView';
import { useWebSocket } from './hooks/useWebSocket';
import { useQueue } from './hooks/useQueue';
import { groupLogs } from './utils/logGrouper';

// Configuration - can be made dynamic via env vars
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function App() {
  // WebSocket connection for real-time logs
  const { logs, isConnected, error: wsError } = useWebSocket(WS_URL);
  
  // Queue status polling
  const { running, queued, completed, failed, stats, loading, error: queueError } = useQueue(API_BASE_URL);

  // Group logs into hierarchical structure
  const groupedLogs = useMemo(() => groupLogs(logs), [logs]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Status Bar */}
      <StatusBar 
        isConnected={isConnected} 
        logCount={logs.length}
      />

      {/* Error Messages */}
      {(wsError || queueError) && (
        <div className="bg-red-900/50 border-b border-red-800 px-4 py-3">
          <p className="text-sm text-red-200">
            {wsError && <span>WebSocket Error: {wsError} </span>}
            {queueError && <span>Queue Error: {queueError}</span>}
          </p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Left Side: Queue Status (collapsible on mobile) */}
        <div className="lg:w-96 border-b lg:border-b-0 lg:border-r border-gray-700 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-gray-500">Loading queue status...</div>
            </div>
          ) : (
            <QueueStatus
              running={running}
              queued={queued}
              completed={completed}
              failed={failed}
              stats={stats}
            />
          )}
        </div>

        {/* Right Side: Log View */}
        <div className="flex-1 overflow-y-auto p-4">
          {logs.length === 0 && isConnected ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-gray-500 mb-2">Connected. Waiting for logs...</div>
                <div className="text-xs text-gray-600">
                  Logs will appear here in real-time as the orchestrator processes issues
                </div>
              </div>
            </div>
          ) : (
            <HierarchicalLogView groupedLogs={groupedLogs} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
