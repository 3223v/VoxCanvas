// types/task.ts

// ===== 意图分析工作流的输出 =====
export interface TaskPlan {
  tasks: TaskNode[];        // 平铺的任务列表（已展开树结构）
  response: string;         // AI 的自然语言回复
}

// 单个任务节点
export interface TaskNode {
  id: string;               // 临时 id，如 "task_0", "task_1"
  taskType: TaskType;
  description: string;
  params: Record<string, unknown>;

  // 树结构
  parentId: string | null;          // 父任务 id（null = 根任务）
  chainOrder: number;               // 链内顺序
  dependsOn: string[];              // 依赖的任务 id 列表
}

export type TaskType =
  | "CREATE"
  | "MODIFY"
  | "DELETE"
  | "MOVE"
  | "CONNECT";
