import React from 'react';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * Shows current queue state
 */
export function QueueStatus({ running, queued, completed, failed, stats }) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-4">
      <h2 className="text-white font-semibold mb-3">Queue Status</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Running */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-gray-400">Running</span>
          </div>
          {running ? (
            <div className="text-white font-medium">Issue #{running.issueNumber}</div>
          ) : (
            <div className="text-gray-500 text-sm">None</div>
          )}
        </div>

        {/* Queued */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Queued</span>
          </div>
          <div className="text-white font-medium">{queued.length}</div>
          {queued.length > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              Next: #{queued[0].issueNumber}
            </div>
          )}
        </div>

        {/* Completed */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">Completed</span>
          </div>
          <div className="text-white font-medium">{completed.length}</div>
          {stats && (
            <div className="text-xs text-gray-500 mt-1">
              {stats.successRate}% success
            </div>
          )}
        </div>

        {/* Failed */}
        <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-gray-400">Failed</span>
          </div>
          <div className="text-white font-medium">{failed.length}</div>
        </div>
      </div>

      {/* Recent History */}
      {(completed.length > 0 || failed.length > 0) && (
        <div className="mt-4">
          <h3 className="text-sm text-gray-400 mb-2">Recent History (Last 5)</h3>
          <div className="space-y-1">
            {[...completed, ...failed]
              .sort((a, b) => new Date(b.completedAt || b.failedAt) - new Date(a.completedAt || a.failedAt))
              .slice(0, 5)
              .map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm bg-gray-900 rounded px-3 py-2 border border-gray-700"
                >
                  <span className="text-white">Issue #{item.issueNumber}</span>
                  <span className={item.error ? 'text-red-400' : 'text-green-400'}>
                    {item.error ? '✗ Failed' : '✓ Completed'}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
