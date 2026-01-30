import React from 'react';
import { Activity, Wifi, WifiOff } from 'lucide-react';

/**
 * Top status bar showing connection status and system info
 */
export function StatusBar({ isConnected, logCount, uptime }) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          <span className="font-semibold text-white">oc-ralph Monitor</span>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>{logCount} logs</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isConnected ? (
          <>
            <Wifi className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-400">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">Disconnected</span>
          </>
        )}
      </div>
    </div>
  );
}
