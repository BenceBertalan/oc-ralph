/**
 * Dependency resolver for deterministic execution
 */
export class DependencyResolver {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * Resolve tasks into execution batches (convenience method)
   */
  resolve(tasks) {
    // If tasks don't have IDs, assign them
    const tasksWithIds = tasks.map((task, index) => ({
      ...task,
      id: task.id || task.taskId || task.title || `task-${index + 1}`
    }));
    
    const graph = this.buildDependencyGraph(tasksWithIds);
    return this.resolveBatches(tasksWithIds, graph);
  }

  /**
   * Build dependency graph from tasks
   */
  buildDependencyGraph(tasks) {
    const graph = {};
    
    tasks.forEach(task => {
      graph[task.id] = task.dependencies || [];
    });

    // Validate dependencies exist
    tasks.forEach(task => {
      const deps = graph[task.id];
      deps.forEach(depId => {
        if (!graph.hasOwnProperty(depId)) {
          throw new Error(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      });
    });

    this.logger.debug('Dependency graph built', { 
      taskCount: tasks.length,
      graph 
    });

    return graph;
  }

  /**
   * Resolve tasks into execution batches using topological sort
   */
  resolveBatches(tasks, dependencyGraph) {
    const batches = [];
    const completed = new Set();
    const taskMap = new Map(tasks.map(t => [t.id, t]));

    // Find tasks with no dependencies (batch 0)
    let currentBatch = tasks.filter(t => 
      !dependencyGraph[t.id] || dependencyGraph[t.id].length === 0
    );

    while (currentBatch.length > 0) {
      // Sort batch by ID for determinism
      currentBatch.sort((a, b) => a.id.localeCompare(b.id));
      
      batches.push(currentBatch);
      currentBatch.forEach(t => completed.add(t.id));

      // Find next batch: tasks whose dependencies are all completed
      currentBatch = tasks.filter(t => {
        if (completed.has(t.id)) return false;
        
        const deps = dependencyGraph[t.id] || [];
        return deps.every(depId => completed.has(depId));
      });
    }

    // Verify all tasks are included
    if (completed.size !== tasks.length) {
      const missing = tasks.filter(t => !completed.has(t.id));
      throw new Error(`Circular dependency detected or orphaned tasks: ${missing.map(t => t.id).join(', ')}`);
    }

    this.logger.info('Execution batches resolved', {
      totalTasks: tasks.length,
      batchCount: batches.length,
      batches: batches.map((b, i) => ({
        batch: i + 1,
        taskCount: b.length,
        taskIds: b.map(t => t.id)
      }))
    });

    return batches;
  }

  /**
   * Validate no circular dependencies
   */
  validateNoCycles(graph) {
    const visited = new Set();
    const recursionStack = new Set();

    const hasCycle = (node) => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        if (hasCycle(node)) {
          throw new Error(`Circular dependency detected involving task: ${node}`);
        }
      }
    }

    return true;
  }
}
