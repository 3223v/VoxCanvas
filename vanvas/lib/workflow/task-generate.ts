/**
 * task-generate — 第一层 LLM 工作流。
 *
 * 职责：理解用户意图 → 拆解为任务 DAG → 生成自然语言回复。
 * 只负责"对象识别 + 关系判断"，不负责"视觉呈现"。
 */
import type { ILLMProvider } from "@/lib/llm";
import type {
  TaskGenerateInput,
  TaskPlan,
  TaskNode,
  TaskType,
  CreateParams,
  ModifyParams,
  DeleteParams,
  ConnectParams,
} from "@/lib/types";
import { normalizeTaskType } from "@/lib/types";
import { detectCircular } from "@/lib/orchestrator/cycle-detect";
import { logger } from "@/lib/logger";

// ── System Prompt ──────────────────────────────────────────

function buildSystemPrompt(input: TaskGenerateInput): string {
  const { canvasWidth, canvasHeight } = input.canvasState.meta;
  const objectCount = input.canvasState.objects.length;

  return `你是一个绘图指令规划器。你的任务是将用户的自然语言绘图需求分解为一组可执行的任务节点（DAG）。

## 画布信息
- 坐标系：原点 (0,0) 在左上角，X 轴向右为正，Y 轴向下为正
- 画布尺寸：${canvasWidth} × ${canvasHeight}
- 当前对象数：${objectCount}
- 所有坐标和尺寸必须是正整数
- 对象间距建议 ≥ 40px
- 对象必须在画布边界内（留 10px 边距）

## 可用的任务类型（共 4 种）

### CREATE — 创建新图形
用于在画布上创建新对象。
params:
- shape: "rect" | "circle" | "ellipse" | "diamond"
- x, y: 位置坐标（整数，可选——不填则由系统自动计算）
- w, h: 宽高（整数，可选——不填则使用默认值 120×80）
- label: 对象上的文字标签
- visualHint: 特殊视觉需求描述（可选，如 "数据库图标"、"醒目的红色"）

位置规则：
- 绝对位置：用户指定坐标时填入 x, y
- 相对位置：如"在 X 的右边"——在 dependsOn 中声明依赖 X 的创建任务，系统会自动计算位置
- 默认位置：不填 x, y，系统自动放置

### MODIFY — 修改已有图形
用于修改画布上已有对象的属性。
params:
- targetId: 目标对象 id（必须是画布上已有对象的 id）
- changes.changeHint: 模糊修改意图（如 "更醒目"、"往右挪"、"改成蓝色"）
  注意：changeHint 和具体属性（x/y/dx/dy/w/h/label/style）互斥——有 changeHint 就没具体属性

如何定位 targetId：
- 按 label 匹配："红色的矩形" → 找 label 或 fill 属性匹配的对象
- 按类型匹配："那个矩形" → 找 type=rect 的对象
- 按位置匹配："左边那个" → 找 x 坐标最小的对象
- 按序数匹配："第一个" → 找 objects 数组中的第一个
- 找不到目标时，在 response 中说明，tasks 为空数组

### DELETE — 删除已有图形
用于从画布上删除对象（会自动级联删除关联的连线）。
params:
- targetId: 目标对象 id（定位规则同 MODIFY）

### CONNECT — 连接两个图形
用于在两个对象之间画连线。
params:
- fromId: 起始对象 id
- toId: 终止对象 id
  支持引用本次新建对象："ref:task_N.output.id"（N 为对应 CREATE 任务的编号）
- label: 连线标注文字（可选）
- lineHint: 连线样式提示（可选，如 "虚线"、"粗箭头"、"弧线"）
- arrowType: "single" | "double" | "none"

## 依赖关系规则（DAG）

每个任务通过 dependsOn 声明依赖的前置任务 id 列表。
空数组 = 无依赖，可立即执行。

规则 1: CREATE 通常 dependsOn = []
规则 2: MODIFY/DELETE 操作已有对象 → dependsOn = []
       操作本次新建的对象 → dependsOn 包含那个 CREATE 任务 id
规则 3: CONNECT 依赖两端对象：
       两端都是已有对象 → dependsOn = []
       一端新建 → dependsOn 包含那个 CREATE 任务 id
       两端新建 → dependsOn 包含两个 CREATE 任务 id
规则 4: 不允许循环依赖
规则 5: dependsOn 中引用的 id 必须存在于当前 tasks 列表中

## ref 引用语法
CONNECT 的 fromId/toId 如果指向本次新建的对象，使用：
"ref:task_N.output.id"
其中 N 是任务编号，系统执行时会自动替换为实际对象 id。

## 输出格式（严格 JSON，不要任何额外文字）

{
  "tasks": [
    {
      "id": "task_0",
      "taskType": "CREATE",
      "description": "创建一个红色登录框",
      "params": {
        "shape": "rect",
        "x": 200,
        "y": 100,
        "w": 140,
        "h": 60,
        "label": "登录",
        "visualHint": "醒目的红色，实色填充"
      },
      "dependsOn": []
    },
    {
      "id": "task_1",
      "taskType": "CONNECT",
      "description": "从登录框到数据库画箭头",
      "params": {
        "fromId": "ref:task_0.output.id",
        "toId": "node_5",
        "label": "查询",
        "lineHint": "实线箭头"
      },
      "dependsOn": ["task_0"]
    }
  ],
  "response": "好的，我画了一个登录框并用箭头连接到数据库。"
}

## 字段规则
- id: "task_0", "task_1", ... 从 0 递增
- taskType: 只能是 CREATE / MODIFY / DELETE / CONNECT
- description: 简短的人类可读描述（≤30字）
- dependsOn: 引用当前 tasks 列表中其他任务的 id

## 自检清单（输出前逐项检查）
1. 每个 task 的 id、taskType、description、params、dependsOn 是否都存在？
2. dependsOn 中引用的 id 是否都在当前 tasks 列表中？
3. 是否存在循环依赖？
4. MODIFY/DELETE 的 targetId 是否有效（画布已有对象或 ref 引用）？
5. ref 引用是否只指向 CREATE 类型任务？
6. params 中的字段是否符合该 taskType 的定义？`;
}

// ── User Message ───────────────────────────────────────────

function buildUserMessage(input: TaskGenerateInput): string {
  const parts: string[] = [];

  // 画布状态
  if (input.canvasState.objects.length === 0) {
    parts.push("## 当前画布状态\n画布为空，没有任何图形。");
  } else {
    // 简化输出：只传每个对象的关键信息
    const summary = input.canvasState.objects.map((obj) => ({
      id: obj.id,
      type: obj.type,
      x: obj.x,
      y: obj.y,
      w: obj.w,
      h: obj.h,
      label: obj.label,
      stroke: obj.stroke,
      fill: obj.fill,
      fillStyle: obj.fillStyle,
    }));
    parts.push(
      "## 当前画布状态\n```json\n" +
        JSON.stringify(summary, null, 1) +
        "\n```"
    );
  }

  // 历史指令
  if (input.recentCommands.length > 0) {
    parts.push("\n## 最近的指令（供上下文参考）");
    input.recentCommands.forEach((cmd, i) => {
      parts.push(`${i + 1}. ${cmd}`);
    });
  }

  // 当前指令
  parts.push(`\n## 用户当前指令\n${input.currentCommand}`);
  parts.push(`\n请输出 JSON。`);

  return parts.join("\n");
}

// ── 校验 ───────────────────────────────────────────────────

function validateTasks(rawTasks: unknown[]): TaskNode[] {
  return rawTasks.map((t: unknown, i: number) => {
    const task = t as Record<string, unknown>;
    const taskType = normalizeTaskType(String(task.taskType ?? "CREATE"));

    return {
      id: String(task.id ?? `task_${i}`),
      taskType,
      description: String(task.description ?? ""),
      params: validateParams(taskType, task.params ?? {}),
      dependsOn: Array.isArray(task.dependsOn)
        ? task.dependsOn.filter(
            (id: unknown) => typeof id === "string"
          )
        : [],
    };
  });
}

function validateParams(
  taskType: TaskType,
  params: unknown
): CreateParams | ModifyParams | DeleteParams | ConnectParams {
  const p = params as Record<string, unknown>;

  switch (taskType) {
    case "CREATE":
      return {
        shape: validateShape(p.shape),
        x: typeof p.x === "number" ? Math.round(p.x) : undefined,
        y: typeof p.y === "number" ? Math.round(p.y) : undefined,
        w: typeof p.w === "number" ? Math.max(10, Math.round(p.w)) : undefined,
        h: typeof p.h === "number" ? Math.max(10, Math.round(p.h)) : undefined,
        label: String(p.label ?? ""),
        visualHint: typeof p.visualHint === "string" ? p.visualHint : undefined,
      };

    case "MODIFY":
      return {
        targetId: String(p.targetId ?? ""),
        changes: normalizeChanges(p.changes ?? {}),
      };

    case "DELETE":
      return {
        targetId: String(p.targetId ?? ""),
      };

    case "CONNECT":
      return {
        fromId: String(p.fromId ?? ""),
        toId: String(p.toId ?? ""),
        label: typeof p.label === "string" ? p.label : undefined,
        lineHint: typeof p.lineHint === "string" ? p.lineHint : undefined,
        arrowType:
          typeof p.arrowType === "string" &&
          ["single", "double", "none"].includes(p.arrowType)
            ? (p.arrowType as "single" | "double" | "none")
            : undefined,
      };
  }
}

function validateShape(shape: unknown): CreateParams["shape"] {
  const valid = ["rect", "circle", "ellipse", "diamond"];
  if (typeof shape === "string" && valid.includes(shape)) {
    return shape as CreateParams["shape"];
  }
  return "rect";
}

function normalizeChanges(changes: unknown): ModifyParams["changes"] {
  const c = changes as Record<string, unknown>;

  // changeHint 与其他字段互斥——有 changeHint 就不带其他字段
  if (typeof c.changeHint === "string" && c.changeHint) {
    return { changeHint: c.changeHint };
  }

  const result: ModifyParams["changes"] = {};
  if (typeof c.x === "number") result.x = Math.round(c.x);
  if (typeof c.y === "number") result.y = Math.round(c.y);
  if (typeof c.dx === "number") result.dx = Math.round(c.dx);
  if (typeof c.dy === "number") result.dy = Math.round(c.dy);
  if (typeof c.w === "number") result.w = Math.round(c.w);
  if (typeof c.h === "number") result.h = Math.round(c.h);
  if (typeof c.label === "string") result.label = c.label;
  if (c.style && typeof c.style === "object") {
    result.style = c.style as ModifyParams["changes"]["style"];
  }

  return result;
}

// ── 主函数 ─────────────────────────────────────────────────

export async function taskGenerate(
  llm: ILLMProvider,
  input: TaskGenerateInput
): Promise<TaskPlan> {
  const startTime = Date.now();
  logger.info("task-generate 开始", {
    command: input.currentCommand.slice(0, 100),
    objectCount: input.canvasState.objects.length,
  });

  const result = await llm.chat({
    messages: [
      { role: "system", content: buildSystemPrompt(input) },
      { role: "user", content: buildUserMessage(input) },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.1,
  });

  logger.info("task-generate LLM 返回", {
    contentLength: result.content.length,
    tokens: result.usage?.totalTokens,
  });

  // 解析 JSON
  let parsed: { tasks?: unknown[]; response?: string };
  try {
    parsed = JSON.parse(result.content);
  } catch {
    logger.error("task-generate JSON 解析失败", { content: result.content.slice(0, 200) });
    throw new Error("task-generate 返回了无效 JSON");
  }

  // 校验 tasks
  const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
  const tasks = validateTasks(rawTasks);

  // 循环依赖检测
  if (tasks.length > 1) {
    const cycle = detectCircular(tasks);
    if (cycle) {
      logger.error("task-generate 检测到循环依赖", { cycle });
      throw new Error(`循环依赖: ${cycle.join(" → ")}`);
    }
  }

  // 过滤掉 dependsOn 中引用不存在的 id
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    task.dependsOn = task.dependsOn.filter((dep) => taskIds.has(dep));
  }

  const response = parsed.response ?? "已完成";

  logger.info("task-generate 完成", {
    taskCount: tasks.length,
    latencyMs: Date.now() - startTime,
    response: response.slice(0, 80),
  });

  return { tasks, response };
}
