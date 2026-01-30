/**
 * Issue Body Manager - Parse and manipulate GitHub issue body structure
 */
export class IssueBodyManager {
  /**
   * Parse issue body into sections
   */
  parse(issueBody) {
    const startMarker = '<!-- oc-ralph-orchestration-start -->';
    const endMarker = '<!-- oc-ralph-orchestration-end -->';
    
    const hasOrchestration = issueBody.includes(startMarker);
    
    if (!hasOrchestration) {
      return {
        originalRequest: issueBody.trim(),
        orchestrationContent: null,
        hasOrchestration: false
      };
    }
    
    const startIdx = issueBody.indexOf(startMarker);
    const endIdx = issueBody.indexOf(endMarker);
    
    return {
      originalRequest: issueBody.substring(0, startIdx).trim(),
      orchestrationContent: issueBody.substring(startIdx, endIdx + endMarker.length),
      hasOrchestration: true
    };
  }
  
  /**
   * Build complete issue body with all sections
   */
  build(spec, plan, originalRequest, statusTable, planningStatus) {
    let body = '<!-- oc-ralph-orchestration-start -->\n';
    body += '# 🤖 oc-ralph Orchestration\n\n';
    
    // Specification section
    if (spec) {
      body += this.buildSpecSection(spec);
    }
    
    // Original request in blockquote
    if (originalRequest) {
      body += '\n---\n\n';
      body += this.buildOriginalRequestSection(originalRequest);
    }
    
    // Plan section (if exists)
    if (plan) {
      body += '\n---\n\n';
      body += this.buildPlanSection(plan);
    }
    
    // Status table (if exists)
    if (statusTable || planningStatus) {
      body += '\n---\n\n';
      body += statusTable || '';
    }
    
    body += '\n<!-- oc-ralph-orchestration-end -->';
    
    return body;
  }
  
  /**
   * Build spec section
   */
  buildSpecSection(spec) {
    return `## 📋 Technical Specification

### Requirements
${spec.requirements.map(r => `- ${r}`).join('\n')}

### Acceptance Criteria
${spec.acceptance_criteria.map(c => `- ${c}`).join('\n')}

### Technical Approach
${spec.technical_approach}

### Edge Cases
${spec.edge_cases?.map(e => `- ${e}`).join('\n') || 'None specified'}

### Dependencies
${spec.dependencies?.map(d => `- ${d}`).join('\n') || 'None'}

### Estimated Complexity
**${spec.estimated_complexity}**`;
  }
  
  /**
   * Build original request section (blockquote)
   */
  buildOriginalRequestSection(originalRequest) {
    const lines = originalRequest.split('\n');
    const quotedLines = lines.map(line => `> ${line}`);
    return `> **📌 Original Request**\n> \n${quotedLines.join('\n')}`;
  }
  
  /**
   * Build plan section
   */
  buildPlanSection(plan) {
    const statusText = plan.approved ? '✅ Approved' : '⏳ Awaiting Approval';
    
    let section = `## 📊 Implementation Plan\n\n`;
    section += `The planning phase has completed. Status: **${statusText}**\n\n`;
    
    if (!plan.approved) {
      section += `Add label \`oc-ralph:approved\` to proceed with implementation.\n\n`;
    }
    
    section += `### Implementation Tasks (${plan.implementationTasks.length})\n`;
    plan.implementationTasks.forEach((task, i) => {
      const issue = plan.implementationIssues[i];
      section += `${i+1}. **${task.title}** (#${issue.issueNumber}) - ${task.estimated_complexity} complexity\n`;
    });
    
    section += `\n### Test Tasks (${plan.testTasks.length})\n`;
    plan.testTasks.forEach((task, i) => {
      const issue = plan.testIssues[i];
      section += `${i+1}. **${task.title}** (#${issue.issueNumber}) - ${task.type}\n`;
    });
    
    return section;
  }
  
  /**
   * Update only status table section
   */
  updateStatusTable(currentBody, newStatusTable) {
    const startMarker = '## 📈 Live Status Table';
    const endMarker = '<!-- oc-ralph-orchestration-end -->';
    
    const startIdx = currentBody.indexOf(startMarker);
    if (startIdx === -1) {
      // No status table yet, append before end marker
      const endIdx = currentBody.indexOf(endMarker);
      if (endIdx === -1) {
        // No orchestration section yet, just append
        return currentBody + '\n\n' + newStatusTable;
      }
      return currentBody.substring(0, endIdx) + 
             '\n' + 
             newStatusTable + 
             '\n\n' + 
             currentBody.substring(endIdx);
    }
    
    const endIdx = currentBody.indexOf(endMarker);
    return currentBody.substring(0, startIdx) + 
           newStatusTable + 
           '\n\n' + 
           currentBody.substring(endIdx);
  }
  
  /**
   * Extract clean spec for agents (no original request or status table)
   */
  extractSpecForAgents(spec) {
    return {
      requirements: spec.requirements,
      acceptance_criteria: spec.acceptance_criteria,
      technical_approach: spec.technical_approach,
      edge_cases: spec.edge_cases,
      dependencies: spec.dependencies,
      estimated_complexity: spec.estimated_complexity
    };
  }
}
