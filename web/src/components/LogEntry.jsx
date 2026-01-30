import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatTimestamp, getLevelColor } from '../utils/logGrouper';

/**
 * Individual log entry display with expandable context
 */
export function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false);
  const hasContext = log.context && Object.keys(log.context).length > 0;

  return (
    <div className="border-l-2 border-gray-700 pl-3 py-1 hover:bg-gray-800/50 transition-colors">
      <div className="flex items-start gap-2">
        {/* Expand button */}
        {hasContext && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        )}

        {/* Log content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-mono">
              {formatTimestamp(log.timestamp)}
            </span>
            <span className={`text-xs font-semibold uppercase ${getLevelColor(log.level)}`}>
              {log.level}
            </span>
            <span className="text-sm text-gray-200 break-words">{log.message}</span>
          </div>

          {/* Expanded context */}
          {expanded && hasContext && (
            <div className="mt-2 bg-gray-900 rounded border border-gray-700 p-2">
              <div className="text-xs font-mono text-gray-400 space-y-1">
                {Object.entries(log.context).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-gray-500">{key}:</span>
                    <span className="text-gray-300">
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
