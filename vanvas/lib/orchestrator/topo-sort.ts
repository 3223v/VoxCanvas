/**
 * DAG 拓扑排序 — 将任务列表转化为分层执行计划。
 */
import type { TaskNode } from "@/lib/types";
import { logger } from "@/lib/logger";

export interface ExecutionLayer {
  tasks: TaskNode[];
}

/**
 * 拓扑排序：返回按依赖关系分层的执行计划。
 * 同层内的任务无相互依赖，可安全执行（每个任务看到前一层完成后的 canvasState）。
 */
export function toposort(tasks: TaskNode[]): ExecutionLayer[] {
  const completed = new Set<string>();
  const remaining = [...tasks];
  const layers: ExecutionLayer[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter((t) =>
      t.dependsOn.every((dep) => completed.has(dep))
    );

    if (ready.length === 0) {
      const remainingIds = remaining.map((t) => t.id).join(", ");
      logger.error("toposort: circular dependency or missing deps", { remainingIds });
      throw new Error(
        `拓扑排序失败：可能存在循环依赖或缺失的依赖。剩余任务: ${remainingIds}`
      );
    }

    layers.push({ tasks: ready });

    for (const t of ready) {
      completed.add(t.id);
      remaining.splice(remaining.indexOf(t), 1);
    }
  }

  logger.debug("toposort result", {
    layerCount: layers.length,
    layers: layers.map((l) => l.tasks.map((t) => t.id)),
  });

  return layers;
}
