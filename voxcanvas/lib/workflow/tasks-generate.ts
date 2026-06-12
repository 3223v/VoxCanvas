// workflow/tasks-generate.ts

import { callLLM } from '@/lib/llm/client';
import { buildIntentAnalyzerPrompt } from '@/lib/prompts/tasks-generate';
import { TaskPlan, TaskNode, TaskType } from '@/lib/types/task';
import { CanvasState } from '@/lib/types/canvas';

export async function analyzeIntent(input: {
  canvasState: CanvasState;
  recentCommands: string[];
  currentCommand: string;
}): Promise<TaskPlan> {

  // 1. 构建 prompt
  const { system, user } = buildIntentAnalyzerPrompt(input);

  // 2. 调用 LLM（带 JSON 结构化输出）
  const raw = await callLLM({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,  // 低温度 → 输出更稳定、更可控
  });

  // 3. 解析 + 校验
  const parsed = JSON.parse(raw.content);

  const plan: TaskPlan = {
    tasks: validateAndNormalizeTasks(parsed.tasks ?? []),
    response: parsed.response ?? '已完成',
  };

  return plan;
}

// 校验 + 补全 LLM 输出
function validateAndNormalizeTasks(tasks: any[]): TaskNode[] {
  return tasks.map((t, i) => ({
    id: t.id ?? `task_${i}`,
    taskType: validateTaskType(t.taskType),
    description: String(t.description ?? ''),
    params: t.params ?? {},
    parentId: t.parentId ?? null,
    chainOrder: t.chainOrder ?? 0,
    dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
  }));
}

function validateTaskType(raw: string): TaskType {
  const valid: TaskType[] = ['CREATE', 'MODIFY', 'DELETE', 'MOVE', 'CONNECT'];
  const found = valid.find(t => t === raw?.toUpperCase());
  if (!found) {
    console.warn(`Unknown taskType: ${raw}, defaulting to CREATE`);
    return 'CREATE';
  }
  return found;
}
