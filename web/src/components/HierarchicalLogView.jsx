import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LogEntry } from './LogEntry';
import { getStatusIcon } from '../utils/logGrouper';

/**
 * Expandable tree view of logs organized by issue and stage
 */
export function HierarchicalLogView({ groupedLogs }) {
  const [expandedIssues, setExpandedIssues] = useState(new Set());
  const [expandedStages, setExpandedStages] = useState(new Set());

  const toggleIssue = (issueId) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
        // Also collapse all stages when collapsing issue
        groupedLogs.find(g => g.id === issueId)?.stages.forEach(stage => {
          next.delete(stage.id);
        });
      } else {
        next.add(issueId);
      }
      return next;
    });
  };

  const toggleStage = (stageId) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  if (!groupedLogs || groupedLogs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No logs available
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groupedLogs.map((issue) => {
        const isIssueExpanded = expandedIssues.has(issue.id);
        const statusInfo = getStatusIcon(issue.status);

        return (
          <div key={issue.id} className="bg-gray-800 rounded-lg border border-gray-700">
            {/* Issue Header */}
            <button
              onClick={() => toggleIssue(issue.id)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-750 transition-colors"
            >
              {isIssueExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
              
              <span className={`text-lg ${statusInfo.color}`}>{statusInfo.icon}</span>
              
              <div className="flex-1 text-left">
                <div className="font-semibold text-white">{issue.title}</div>
                <div className="text-xs text-gray-500">
                  {issue.logs.length} logs • {issue.stages.length} stages
                </div>
              </div>
              
              <span className={`text-sm ${statusInfo.color}`}>{issue.status}</span>
            </button>

            {/* Issue Content */}
            {isIssueExpanded && (
              <div className="border-t border-gray-700 px-4 py-2">
                {issue.stages.length > 0 ? (
                  <div className="space-y-2">
                    {issue.stages.map((stage) => {
                      const isStageExpanded = expandedStages.has(stage.id);
                      const stageStatusInfo = getStatusIcon(stage.status);

                      return (
                        <div key={stage.id} className="bg-gray-900 rounded border border-gray-700">
                          {/* Stage Header */}
                          <button
                            onClick={() => toggleStage(stage.id)}
                            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-gray-800 transition-colors"
                          >
                            {isStageExpanded ? (
                              <ChevronDown className="w-3 h-3 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-gray-500" />
                            )}
                            
                            <span className={`text-sm ${stageStatusInfo.color}`}>
                              {stageStatusInfo.icon}
                            </span>
                            
                            <div className="flex-1 text-left">
                              <span className="text-sm font-medium text-gray-200">
                                {stage.title}
                              </span>
                              <span className="text-xs text-gray-500 ml-2">
                                {stage.logs.length} logs
                              </span>
                            </div>
                            
                            <span className={`text-xs ${stageStatusInfo.color}`}>
                              {stage.status}
                            </span>
                          </button>

                          {/* Stage Logs */}
                          {isStageExpanded && (
                            <div className="border-t border-gray-700 px-3 py-2 space-y-1 max-h-96 overflow-y-auto">
                              {stage.logs.map((log, idx) => (
                                <LogEntry key={idx} log={log} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto">
                    {issue.logs.map((log, idx) => (
                      <LogEntry key={idx} log={log} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
