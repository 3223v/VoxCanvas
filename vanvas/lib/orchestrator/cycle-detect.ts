/**
 * DAG 循环依赖检测（DFS）。
 * 如果存在环，返回环上的节点 id 列表；否则返回 null。
 */
import type { TaskNode } from "@/lib/types";
import { logger } from "@/lib/logger";

export function detectCircular(tasks: TaskNode[]): string[] | null {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) {
      const idx = path.indexOf(id);
      const cycle = [...path.slice(idx), id];
      logger.warn("circular dependency detected", { cycle: cycle.join(" → ") });
      return cycle;
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    path.push(id);

    const task = taskMap.get(id);
    if (task) {
      for (const dep of task.dependsOn) {
        const cycle = dfs(dep, path);
        if (cycle) return cycle;
      }
    }

    path.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const task of tasks) {
    const cycle = dfs(task.id, []);
    if (cycle) return cycle;
  }
  return null;
}
