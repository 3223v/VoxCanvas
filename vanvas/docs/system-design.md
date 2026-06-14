# 语音绘图系统：AI 指令到渲染完整设计文档

---

## 〇、前置依赖：LLM Provider

**已实现**，位于 `lib/llm/`。

### 配置

用户在 `.env.local` 中设置三个环境变量，**不设默认模型**：

```bash
LLM_API_KEY=your-key          # API 密钥（必填）
LLM_BASE_URL=https://...      # API 端点（必填，如 https://open.bigmodel.cn/api/paas/v4）
LLM_MODEL_NAME=glm-4-flash    # 模型名（必填）
```

### 接口

```typescript
// lib/llm/types.ts
interface ILLMProvider {
  readonly name: string;                    // 模型名
  chat(options: LLMChatOptions): Promise<LLMChatResult>;
}

interface LLMChatOptions {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  responseFormat?: { type: "json_object" };  // 强制 JSON 输出
  temperature?: number;                      // 默认 0.1
  maxTokens?: number;
}

interface LLMChatResult {
  content: string;                           // 响应文本
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}
```

### 使用方式

```typescript
import { getLLMProvider } from "@/lib/llm";

const llm = getLLMProvider();
const result = await llm.chat({
  messages: [
    { role: "system", content: "你是一个绘图指令规划器..." },
    { role: "user", content: "画一个红色矩形" },
  ],
  responseFormat: { type: "json_object" },
  temperature: 0.1,
});
// result.content 是 JSON 字符串
```

### 协议

采用 OpenAI 兼容的 `/chat/completions` 端点。已在 `lib/llm/provider.ts` 中实现单例、重试（可重试状态码 429/5xx，最多 2 次重试）、JSON 合法性二次校验。

---

## 一、系统全景

### 1.1 数据流总览

```
用户语音
    ↓
ASR 语音识别（modules/asr/）
    ↓
文本指令（string）
    ↓
┌─────────────────────────────────────────────────────────┐
│             POST /api/canvas/[id]/command                │
│                                                         │
│  1. 加载会话：canvasState + recentCommands + 画布 meta   │
│                                                         │
│  2. task-generate（第一层 LLM）                          │
│     职责：意图理解 + 任务拆解 + 关系判断                  │
│     输入：指令 + 画布摘要 + 历史                         │
│     输出：TaskPlan { tasks[], response }                 │
│     ↓                                                   │
│  3. 持久化 commands 行（plan + snapshot_before）         │
│     ↓                                                   │
│  4. Orchestrator 编排                                    │
│     拓扑排序 → 分层 → 逐层串行调度 Handler               │
│     同层任务之间更新 canvasState 后传给下一个任务         │
│     ↓                                                   │
│  5. Handler 层                                          │
│     - 需要 LLM → 调用子工作流（第二层，精确绘图参数）     │
│     - 不需要   → 纯硬编码执行                            │
│     每个 Handler 产出最终的 DrawObject 或操作指令         │
│     ↓                                                   │
│  6. 持久化 tasks 行（每个 task 执行结果）                │
│     ↓                                                   │
│  7. 持久化 canvases.state（整个指令执行完毕后的最新状态）│
│     ↓                                                   │
│  8. 返回前端：更新后的 objects[] 数组                    │
└─────────────────────────────────────────────────────────┘
    ↓
前端 RoughCanvas：setObjects(newObjects) → 全量重绘
```

### 1.2 两层 LLM 职责边界（关键）

```
第一层 task-generate：回答"做什么？对象间有什么关系？"
  - 意图分类（CREATE / MODIFY / DELETE / CONNECT）
  - 目标定位（"那个红色的矩形" → 找到 targetId）
  - 任务依赖关系（"先画 A 再画 B，然后连线" → DAG）
  - 生成自然语言回复

第二层 子工作流：回答"怎么做？视觉上如何呈现？"
  - CREATE → 精确坐标、尺寸、颜色、填充样式、装饰
  - MODIFY → 模糊描述 → 具体属性值映射（"更醒目" → 高对比色 + 加粗）
  - CONNECT → 连线样式、箭头类型、标注
  - DELETE → 不需要子工作流
```

**第一层输出的是"指令骨架"，第二层填充"视觉血肉"。**

---

## 二、类型体系（与现有 DrawObject 对齐）

### 2.1 现有系统的渲染对象

直接沿用 `components/canvas/RoughCanvas.tsx` 中已定义的 `DrawObject` 类型，**不做破坏性修改**：

```typescript
// === 与现有代码完全一致，仅新增 fromId/toId 可选字段 ===

type FillStyle = "solid" | "hachure" | "cross-hatch" | "dots" | "dashed" | "zigzag";

interface DrawObject {
  // 形状标识
  type: "line" | "dashed" | "arrow" | "arc-arrow"
      | "rect" | "diamond" | "circle" | "ellipse";

  // 自由线条的点序列（type=line/arrow/dashed/arc-arrow 时使用）
  points?: number[][];

  // 几何形状的包围盒（type=rect/diamond/circle/ellipse 时使用）
  x?: number;
  y?: number;
  w?: number;
  h?: number;

  // 样式
  stroke?: string;
  strokeWidth?: number;
  roughness?: number;
  seed?: number;
  fill?: string;
  fillStyle?: FillStyle;

  // 以下为新增可选字段，用于 AI 绘图场景 ────────────
  /** 对象唯一标识（AI 生成时分配，现有 freehand 对象可无此字段） */
  id?: string;
  /** 连线起点对象 id */
  fromId?: string;
  /** 连线终点对象 id */
  toId?: string;
  /** 对象上的文字标签 */
  label?: string;
  /** 箭头类型 */
  arrowType?: "single" | "double" | "none";
}
```

### 2.2 任务系统的类型

```typescript
// === lib/types/task.ts ===

type TaskType = "CREATE" | "MODIFY" | "DELETE" | "CONNECT";

type TaskStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCESS"
  | "FAILED"
  | "SKIPPED";

interface TaskNode {
  id: string;           // "task_0", "task_1", ...
  taskType: TaskType;
  description: string;  // 人类可读描述，如"画一个红色登录框"
  params: TaskParams;
  dependsOn: string[];  // 依赖的前置任务 id 列表（DAG 边）
}

// ── 按 taskType 区分的 params ──
type TaskParams = CreateParams | ModifyParams | DeleteParams | ConnectParams;

interface CreateParams {
  shape: "rect" | "circle" | "ellipse" | "diamond";
  /** 位置建议（可选，由子工作流最终确定） */
  x?: number;
  y?: number;
  /** 尺寸建议（可选） */
  w?: number;
  h?: number;
  label: string;
  /** 样式可以完全不填，全交给子工作流 */
  style?: Partial<ShapeStyle>;
  /** 特殊视觉需求，如"图标风格"、"圆柱体效果"，由子工作流解析 */
  visualHint?: string;
}

interface ModifyParams {
  targetId: string;           // 画布已有对象 id
  changes: ModifyChanges;
}

interface ModifyChanges {
  // 位置：绝对坐标与相对偏移互斥
  x?: number;
  y?: number;
  dx?: number;
  dy?: number;
  // 尺寸
  w?: number;
  h?: number;
  // 文字
  label?: string;
  // 样式（部分字段）
  style?: Partial<ShapeStyle>;
  // 模糊修改意图（与上面的具体字段互斥——有一个就没另一个）
  changeHint?: string;  // 如 "更醒目"、"换成冷色调"
}

interface DeleteParams {
  targetId: string;
}

interface ConnectParams {
  fromId: string;
  toId: string;
  label?: string;
  /** 连线样式线索，由子工作流细化 */
  lineHint?: string;  // 如 "虚线"、"粗箭头"、"弧线"
  arrowType?: "single" | "double" | "none";
}

// ── 通用样式 ──
interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  fillStyle: FillStyle;
  roughness: number;
}
```

### 2.3 工作流的输入输出

```typescript
// === lib/types/workflow.ts ===

interface CanvasMeta {
  canvasWidth: number;   // 默认 1200
  canvasHeight: number;  // 默认 800
}

interface CanvasState {
  objects: DrawObject[];
  meta: CanvasMeta;
}

interface TaskGenerateInput {
  canvasState: CanvasState;
  recentCommands: string[];    // 最近 5 条指令原文
  currentCommand: string;      // 当前用户指令
}

interface TaskPlan {
  tasks: TaskNode[];
  response: string;            // AI 自然语言回复
}
```

### 2.4 Handler 的执行上下文与结果

```typescript
// === lib/types/handler.ts ===

interface HandlerContext {
  canvasState: CanvasState;       // 本任务执行前的画布状态
  executionResults: Map<string, TaskExecutionResult>;  // 已完成任务
  emit: (event: SSEEvent) => void;  // SSE 推送回调
}

interface TaskExecutionResult {
  taskId: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  /** 本次任务产生的 DrawObject（CREATE/CONNECT）或被更新的 DrawObject（MODIFY） */
  outputObject?: DrawObject;
  /** 要删除的对象 id（DELETE） */
  deletedObjectId?: string;
  /** 关联删除的连线 id 列表（DELETE 级联） */
  cascadedDeleteIds?: string[];
  /** 失败信息 */
  error?: string;
  /** LLM 消耗 */
  llmUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}
```

---

## 三、第一层：task-generate 工作流

### 3.1 文件位置

`lib/workflow/task-generate.ts`

### 3.2 职责

接收用户自然语言指令，输出结构化的任务 DAG。

注意：**第一层只负责"对象识别 + 关系判断"，不负责"视觉呈现"**。坐标和样式可以不精确，由第二层子工作流补全。

### 3.3 主函数签名

```typescript
import { ILLMProvider } from "@/lib/llm";

export async function taskGenerate(
  llm: ILLMProvider,
  input: TaskGenerateInput
): Promise<TaskPlan>
```

### 3.4 执行流程

```
步骤 1: 构建 system prompt + user message
步骤 2: llm.chat({ messages, responseFormat: "json_object", temperature: 0.1 })
步骤 3: JSON.parse(result.content)
步骤 4: 校验 tasks 数组:
        - 每个 task 有 id, taskType, description, params, dependsOn
        - taskType 归一化（别名映射 + 兜底降级为 CREATE）
        - dependsOn 引用的 id 必须存在
步骤 5: 循环依赖检测（DFS）
步骤 6: 返回 TaskPlan
```

### 3.5 校验与归一化

```typescript
function validateAndNormalize(rawTasks: any[]): TaskNode[] {
  return rawTasks.map((t, i) => {
    const taskType = normalizeTaskType(t.taskType);

    return {
      id: t.id ?? `task_${i}`,
      taskType,
      description: String(t.description ?? ""),
      params: validateParams(taskType, t.params ?? {}),
      dependsOn: Array.isArray(t.dependsOn)
        ? t.dependsOn.filter((id: any) => typeof id === "string")
        : [],
    };
  });
}
```

### 3.6 targetId 定位规则（第一层必须做好）

当用户说"把那个红色的矩形改成蓝色"时，第一层必须在画布已有对象中定位目标：

```
优先级：
  1. label 匹配："红色的矩形" → 找 label 含"红"或 fill 为红色的 rect
  2. 类型匹配："矩形" → 找 type=rect 的对象
  3. 位置匹配："左边那个" → 找 x 最小的对象
  4. 序数匹配："第一个" → objects[0]

找不到目标 → 在 response 中说明"找不到目标对象"，tasks 为空
```

这些规则必须写入 system prompt。

### 3.7 循环依赖检测

```typescript
function detectCircular(tasks: TaskNode[]): string[] | null {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) {
      const idx = path.indexOf(id);
      return [...path.slice(idx), id];
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
```

---

## 四、编排器 Orchestrator

### 4.1 文件位置

`lib/orchestrator/orchestrator.ts`

### 4.2 职责

接收 TaskPlan，拓扑排序后逐层执行 Handler，管理 canvasState 的更新和任务间的状态传递。

### 4.3 核心设计决策：**同层串行执行**

```
                   Layer 0:             [task_0] → [task_1]    串行
                   Layer 1:             [task_2]                串行

为什么串行？因为 task_1 的坐标计算需要知道 task_0 产出的对象位置。
并行虽然更快，但在少量任务（2-5 个）的场景下，200ms 的差异用户无感知。
```

### 4.4 拓扑排序

```typescript
// lib/orchestrator/topo-sort.ts

interface ExecutionLayer {
  tasks: TaskNode[];
}

function toposort(tasks: TaskNode[]): ExecutionLayer[] {
  const completed = new Set<string>();
  const remaining = [...tasks];
  const layers: ExecutionLayer[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter((t) =>
      t.dependsOn.every((dep) => completed.has(dep))
    );

    if (ready.length === 0) {
      throw new Error(
        "Circular dependency detected: " +
        remaining.map((t) => t.id).join(", ")
      );
    }

    layers.push({ tasks: ready });

    for (const t of ready) {
      completed.add(t.id);
      remaining.splice(remaining.indexOf(t), 1);
    }
  }

  return layers;
}
```

### 4.5 主编排函数

```typescript
// lib/orchestrator/orchestrator.ts

import { ILLMProvider } from "@/lib/llm";

interface OrchestratorOptions {
  llm: ILLMProvider;
  canvasState: CanvasState;
  taskPlan: TaskPlan;
  emit: (event: SSEEvent) => void;  // 可为 noop（同步模式）
}

interface OrchestratorResult {
  finalCanvasState: CanvasState;
  results: Map<string, TaskExecutionResult>;
  summary: { total: number; success: number; failed: number; skipped: number };
}

export async function runOrchestrator(
  options: OrchestratorOptions
): Promise<OrchestratorResult> {
  const { llm, canvasState, taskPlan, emit } = options;

  const layers = toposort(taskPlan.tasks);
  const results = new Map<string, TaskExecutionResult>();
  let currentState = cloneCanvasState(canvasState);
  // cloneCanvasState: 深拷贝，避免污染原始对象

  for (const layer of layers) {
    for (const task of layer.tasks) {
      // 解析 ref 引用（将 "ref:task_N.output.id" 替换为实际 id）
      const resolvedParams = resolveRefs(task.params, results);

      // 构建上下文
      const ctx: HandlerContext = {
        canvasState: currentState,
        executionResults: results,
        emit,
      };

      const resolvedTask: TaskNode = { ...task, params: resolvedParams };

      // 路由到 Handler
      const handler = getHandler(task.taskType);
      const result = handler
        ? await handler({ llm, task: resolvedTask, context: ctx })
        : { taskId: task.id, status: "SKIPPED" as const, error: `未知 taskType: ${task.taskType}` };

      results.set(task.id, result);

      // 更新 canvasState
      if (result.status === "SUCCESS") {
        currentState = applyResult(currentState, result);
      }

      // SSE 推送
      emit({
        type: result.status === "SUCCESS" ? "TASK_RESULT" : "TASK_FAILED",
        taskId: task.id,
        description: task.description,
        ...(result.status === "SUCCESS"
          ? { canvasState: currentState }
          : { error: result.error }),
      });
    }
  }

  return {
    finalCanvasState: currentState,
    results,
    summary: computeSummary(results, taskPlan.tasks.length),
  };
}
```

### 4.6 canvasState 更新逻辑

```typescript
function applyResult(
  state: CanvasState,
  result: TaskExecutionResult
): CanvasState {
  const objects = [...state.objects];

  switch (result.status) {
    case "SUCCESS":
      if (result.outputObject) {
        // CREATE 或 CONNECT：追加新对象
        if (!objects.find((o) => o.id === result.outputObject!.id)) {
          objects.push(result.outputObject);
        }
      }
      if (result.deletedObjectId) {
        // DELETE：移除目标对象
        const idx = objects.findIndex((o) => o.id === result.deletedObjectId);
        if (idx >= 0) objects.splice(idx, 1);
        // 级联删除关联连线
        if (result.cascadedDeleteIds) {
          for (const cid of result.cascadedDeleteIds) {
            const ci = objects.findIndex((o) => o.id === cid);
            if (ci >= 0) objects.splice(ci, 1);
          }
        }
      }
      break;
    // FAILED / SKIPPED：不修改 canvasState
  }

  return { ...state, objects };
}
```

---

## 五、Handler 层

### 5.1 Handler 注册

```typescript
// lib/handlers/handler-registry.ts

type HandlerFn = (input: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}) => Promise<TaskExecutionResult>;

const registry = new Map<TaskType, HandlerFn>();

export function registerHandler(taskType: TaskType, handler: HandlerFn): void {
  registry.set(taskType, handler);
}

export function getHandler(taskType: string): HandlerFn | undefined {
  // 先精确匹配，再尝试归一化
  if (registry.has(taskType as TaskType)) {
    return registry.get(taskType as TaskType);
  }
  const normalized = normalizeTaskType(taskType);
  return registry.get(normalized);
}

// 初始化时注册四个 Handler
export function initHandlers(): void {
  registerHandler("CREATE", createHandler);
  registerHandler("MODIFY", modifyHandler);
  registerHandler("DELETE", deleteHandler);
  registerHandler("CONNECT", connectHandler);
}
```

### 5.2 CreateHandler

```typescript
// lib/handlers/create-handler.ts

async function createHandler({ llm, task, context }: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const params = task.params as CreateParams;

  // ── Step 1: 判断是否需要子工作流 ──
  const needsLLM =
    params.visualHint != null ||                // 有特殊视觉需求
    params.x == null || params.y == null ||     // 坐标不完整
    params.w == null || params.h == null ||     // 尺寸不完整
    params.style == null;                       // 没有完整样式

  let finalParams: Required<CreateParams>;

  if (needsLLM) {
    // ── Step 2a: 调用 CreateSubWorkflow ──
    finalParams = await createSubWorkflow(llm, {
      description: task.description,
      params,
      canvasState: context.canvasState,
    });
  } else {
    // ── Step 2b: 直接使用第一层的参数 ──
    finalParams = fillDefaultStyle(params as Required<CreateParams>);
  }

  // ── Step 3: 硬编码边界校验 ──
  const clamped = clampPosition(
    finalParams.x, finalParams.y,
    finalParams.w, finalParams.h,
    context.canvasState.meta.canvasWidth,
    context.canvasState.meta.canvasHeight
  );

  // ── Step 4: 重叠检测 ──
  const adjusted = avoidOverlap(
    clamped.x, clamped.y, clamped.w, clamped.h,
    context.canvasState.objects,
    context.canvasState.meta
  );

  // ── Step 5: 生成 DrawObject ──
  const obj: DrawObject = {
    id: generateObjectId(),
    type: finalParams.shape as DrawObject["type"],
    x: adjusted.x,
    y: adjusted.y,
    w: adjusted.w,
    h: adjusted.h,
    label: finalParams.label,
    stroke: finalParams.style.stroke,
    strokeWidth: finalParams.style.strokeWidth,
    roughness: finalParams.style.roughness,
    ...(finalParams.style.fillStyle !== "solid" || finalParams.style.fill !== "#ffffff"
      ? { fill: finalParams.style.fill, fillStyle: finalParams.style.fillStyle }
      : {}),
  };

  return {
    taskId: task.id,
    status: "SUCCESS",
    outputObject: obj,
  };
}
```

### 5.3 ModifyHandler

```typescript
// lib/handlers/modify-handler.ts

async function modifyHandler({ llm, task, context }: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const params = task.params as ModifyParams;

  // ── Step 1: 定位目标对象 ──
  const target = findObjectById(params.targetId, context.canvasState.objects);
  if (!target) {
    return { taskId: task.id, status: "FAILED", error: `找不到目标: ${params.targetId}` };
  }

  // ── Step 2: 判断是否需要子工作流 ──
  const needsLLM = params.changes.changeHint != null;

  let resolvedChanges: ModifyChanges;

  if (needsLLM) {
    // 调用 ModifySubWorkflow 将模糊描述解析为具体属性
    resolvedChanges = await modifySubWorkflow(llm, {
      description: task.description,
      changeHint: params.changes.changeHint!,
      targetObject: target,
      canvasState: context.canvasState,
    });
  } else {
    resolvedChanges = params.changes;
  }

  // ── Step 3: 应用变更 ──
  const updated = applyChanges(target, resolvedChanges);

  // ── Step 4: 边界校验 ──
  const clamped = clampPosition(
    updated.x!, updated.y!, updated.w!, updated.h!,
    context.canvasState.meta.canvasWidth,
    context.canvasState.meta.canvasHeight
  );
  updated.x = clamped.x;
  updated.y = clamped.y;

  return {
    taskId: task.id,
    status: "SUCCESS",
    outputObject: updated,  // 前端用这个对象替换旧对象
  };
}
```

#### applyChanges 实现细节

```typescript
function applyChanges(obj: DrawObject, changes: ModifyChanges): DrawObject {
  const updated = { ...obj };

  if (changes.x !== undefined) updated.x = changes.x;
  if (changes.y !== undefined) updated.y = changes.y;
  if (changes.dx !== undefined && updated.x !== undefined) updated.x += changes.dx;
  if (changes.dy !== undefined && updated.y !== undefined) updated.y += changes.dy;
  if (changes.w !== undefined) updated.w = changes.w;
  if (changes.h !== undefined) updated.h = changes.h;
  if (changes.label !== undefined) updated.label = changes.label;
  if (changes.style) {
    updated.stroke = changes.style.stroke ?? updated.stroke;
    updated.strokeWidth = changes.style.strokeWidth ?? updated.strokeWidth;
    updated.roughness = changes.style.roughness ?? updated.roughness;
    updated.fill = changes.style.fill ?? updated.fill;
    updated.fillStyle = changes.style.fillStyle ?? updated.fillStyle;
  }

  return updated;
}
```

### 5.4 DeleteHandler

```typescript
// lib/handlers/delete-handler.ts
// 纯硬编码，不调用 LLM

async function deleteHandler({ task, context }: {
  llm: ILLMProvider;  // 不使用
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const params = task.params as DeleteParams;

  // ── Step 1: 定位目标对象 ──
  const target = findObjectById(params.targetId, context.canvasState.objects);
  if (!target) {
    return { taskId: task.id, status: "FAILED", error: `找不到目标: ${params.targetId}` };
  }

  // ── Step 2: 查找关联连线（级联删除） ──
  const cascaded = context.canvasState.objects.filter(
    (o) =>
      (o.type === "arrow" || o.type === "arc-arrow" || o.type === "line") &&
      (o.fromId === params.targetId || o.toId === params.targetId)
  );

  return {
    taskId: task.id,
    status: "SUCCESS",
    deletedObjectId: params.targetId,
    cascadedDeleteIds: cascaded.map((o) => o.id).filter(Boolean) as string[],
  };
}
```

### 5.5 ConnectHandler

```typescript
// lib/handlers/connect-handler.ts

async function connectHandler({ llm, task, context }: {
  llm: ILLMProvider;
  task: TaskNode;
  context: HandlerContext;
}): Promise<TaskExecutionResult> {
  const params = task.params as ConnectParams;

  // ── Step 1: 定位两端对象 ──
  const from = findObjectById(params.fromId, context.canvasState.objects);
  const to = findObjectById(params.toId, context.canvasState.objects);
  if (!from || !to) {
    return { taskId: task.id, status: "FAILED",
      error: `找不到端点: ${!from ? params.fromId : params.toId}` };
  }

  // ── Step 2: 判断是否需要子工作流 ──
  const needsLLM = params.lineHint != null;

  let connectResult: {
    lineType: DrawObject["type"];
    fromX: number; fromY: number;
    toX: number; toY: number;
    arrowType: "single" | "double" | "none";
    style: { stroke: string; strokeWidth: number };
    label?: string;
  };

  if (needsLLM) {
    connectResult = await connectSubWorkflow(llm, {
      description: task.description,
      lineHint: params.lineHint!,
      fromObject: from,
      toObject: to,
      canvasState: context.canvasState,
    });
  } else {
    // 纯硬编码：中心到中心，默认箭头直线
    connectResult = computeDefaultConnection(from, to, params);
  }

  // ── Step 3: 构建连线 DrawObject ──
  const lineObj: DrawObject = {
    id: generateObjectId(),
    type: connectResult.lineType,
    points: [
      [connectResult.fromX, connectResult.fromY],
      [connectResult.toX, connectResult.toY],
    ],
    fromId: params.fromId,
    toId: params.toId,
    stroke: connectResult.style.stroke,
    strokeWidth: connectResult.style.strokeWidth,
    roughness: 0.5,
    label: connectResult.label,
    arrowType: connectResult.arrowType,
  };

  return {
    taskId: task.id,
    status: "SUCCESS",
    outputObject: lineObj,
  };
}
```

#### 默认连线计算

```typescript
function computeDefaultConnection(
  from: DrawObject,
  to: DrawObject,
  params: ConnectParams
) {
  const fromCx = (from.x ?? 0) + (from.w ?? 0) / 2;
  const fromCy = (from.y ?? 0) + (from.h ?? 0) / 2;
  const toCx = (to.x ?? 0) + (to.w ?? 0) / 2;
  const toCy = (to.y ?? 0) + (to.h ?? 0) / 2;

  return {
    lineType: "arrow" as const,
    fromX: fromCx, fromY: fromCy,
    toX: toCx, toY: toCy,
    arrowType: params.arrowType ?? "single",
    style: { stroke: "#333333", strokeWidth: 2 },
    label: params.label,
  };
}
```

---

## 六、子工作流层（第二层 LLM）

### 6.1 CreateSubWorkflow

**文件**：`lib/workflow/sub-workflows/create-sub-workflow.ts`

```
职责：将第一层的创建任务参数补全为精确的绘图参数

何时调用：
  - params.x/y 缺失 → 计算合理位置
  - params.w/h 缺失 → 推测合适尺寸
  - params.style 缺失 → 选择默认样式或根据 visualHint 生成风格化样式
  - params.visualHint 存在 → 生成特殊视觉效果（如"数据库图标"→双层椭圆）

输入：
  - description: task.description
  - params: 第一层产出的 CreateParams
  - canvasState: 当前画布状态（用于避免重叠、风格一致性）

输出：
  - 完整的 CreateParams（x, y, w, h, shape, label, style 全部确定）

调用方式：
  llm.chat({
    messages: [systemPrompt, userMessage],
    responseFormat: { type: "json_object" },
    temperature: 0.1,
  })
```

**位置计算逻辑（硬编码部分，不依赖 LLM）**：

```typescript
function findDefaultPosition(
  objects: DrawObject[],
  meta: CanvasMeta,
  w: number,
  h: number
): { x: number; y: number } {
  if (objects.length === 0) {
    return {
      x: Math.round((meta.canvasWidth - w) / 2),
      y: Math.round((meta.canvasHeight - h) / 2) - 50,
    };
  }

  // 放在最底部对象的下方
  const bottom = objects.reduce((max, obj) =>
    ((obj.y ?? 0) + (obj.h ?? 0)) > ((max.y ?? 0) + (max.h ?? 0)) ? obj : max
  );
  return {
    x: bottom.x ?? Math.round((meta.canvasWidth - w) / 2),
    y: (bottom.y ?? 0) + (bottom.h ?? 0) + 40,
  };
}

function avoidOverlap(
  x: number, y: number, w: number, h: number,
  objects: DrawObject[],
  meta: CanvasMeta,
  spacing = 40
): { x: number; y: number } {
  // 检测是否与已有对象重叠，最多尝试 10 次偏移
  let attempt = 0;
  while (attempt < 10) {
    const overlapping = objects.some((obj) => {
      const ox = obj.x ?? 0, oy = obj.y ?? 0;
      const ow = obj.w ?? 0, oh = obj.h ?? 0;
      return !(x + w < ox || x > ox + ow || y + h < oy || y > oy + oh);
    });
    if (!overlapping) break;
    y += h + spacing * (attempt + 1);
    attempt++;
  }
  return clampPosition(x, y, w, h, meta.canvasWidth, meta.canvasHeight);
}
```

**注意**：位置计算在 Handler 层（硬编码）完成。CreateSubWorkflow **只负责决定视觉样式**（shape 类型选择、颜色、填充）。坐标由 Handler 的计算逻辑决定，不依赖 LLM 猜测坐标。

#### CreateSubWorkflow system prompt 要点

```
你是一个手绘风格绘图样式设计师。

根据用户的描述和画布上下文，为要创建的对象选择合适的样式。

## 输入信息
- 用户的描述
- 建议的形状类型
- 特殊的视觉需求（visualHint，如果有）
- 画布上已有对象的样式（用于风格一致性参考）

## 可用样式参数
- fill: 十六进制颜色，如 "#4a90d9"
- stroke: 十六进制边框色，如 "#1a1a1a"
- strokeWidth: 边框粗细，建议 2-4
- fillStyle: 填充类型
  - "solid": 实色填充
  - "hachure": 斜线阴影
  - "cross-hatch": 交叉阴影
  - "dots": 散点
  - "dashed": 虚线填充
  - "zigzag": 锯齿
- roughness: 手绘粗糙度 0~2，默认 0.5

## 颜色规则
- 使用柔和的颜色，避免纯黑纯白
- 相邻对象使用协调的颜色
- "醒目"/"强调" → 高饱和度 + solid 填充 + 粗边框
- "柔和"/"淡雅" → 低饱和度 + hachure 填充

## 输出格式
严格 JSON:
{
  "shape": "rect",
  "style": {
    "fill": "#...",
    "stroke": "#...",
    "strokeWidth": 2,
    "fillStyle": "hachure",
    "roughness": 0.8
  }
}
```

### 6.2 ModifySubWorkflow

**文件**：`lib/workflow/sub-workflows/modify-sub-workflow.ts`

```
职责：将模糊的修改意图（changeHint）解析为具体的属性变更

输入：
  - description: task.description
  - changeHint: 如 "更醒目"、"换成冷色调"、"再大一点"
  - targetObject: 被修改对象的完整 DrawObject
  - canvasState: 画布上下文

输出：
  - 具体的 ModifyChanges（不含 changeHint，只有 x/y/dx/dy/w/h/label/style 中的实际变更字段）

prompt 要点：
  - 输入当前对象的完整属性，让 LLM 知道基准值
  - 要求只输出变化的字段（不要输出与当前值相同的字段）
  - 颜色用六位十六进制
  - 数值用整数
```

**changeHint 到具体值的映射示例（prompt 中作为 few-shot）**：

```
"更醒目" → { style: { fill: "#e03131", stroke: "#1a1a1a", strokeWidth: 3, fillStyle: "solid" } }
"柔和一点" → { style: { fill: "#f5f0e8", stroke: "#8b7355", fillStyle: "hachure", roughness: 1.5 } }
"再大一点" → { w: <当前*1.3>, h: <当前*1.3> }
"往右挪一点" → { dx: 40 }
"改成蓝色" → { style: { fill: "#1971c2" } }
```

### 6.3 ConnectSubWorkflow

**文件**：`lib/workflow/sub-workflows/connect-sub-workflow.ts`

```
职责：处理连线的样式选择

输入：
  - description: task.description
  - lineHint: 如 "虚线"、"粗箭头"、"弧线"
  - fromObject / toObject: 两端对象的完整信息
  - canvasState: 画布上下文

输出：
  {
    lineType: "arrow" | "line" | "dashed" | "arc-arrow",
    arrowType: "single" | "double" | "none",
    style: { stroke: "#...", strokeWidth: 2 },
    label: string
  }
```

---

## 七、SSE 通信协议

### 7.1 端点设计

```
GET  /api/canvas/[id]/sse     # 建立 SSE 连接
POST /api/canvas/[id]/command  # 发送指令，触发 AI 绘图
```

**注意**：需要 Node.js 运行时，不支持 Edge Runtime（因为 better-sqlite3 和 SSE 长连接）。

### 7.2 消息类型

```typescript
// lib/sse/sse-types.ts

type SSEEvent =
  | { type: "PLAN_READY"; response: string; taskSummary: TaskSummary[] }
  | { type: "TASK_START"; taskId: string; description: string }
  | { type: "TASK_RESULT"; taskId: string; description: string; canvasState: CanvasState }
  | { type: "TASK_FAILED"; taskId: string; description: string; error: string }
  | { type: "ALL_DONE"; summary: { total: number; success: number; failed: number; skipped: number } };

interface TaskSummary {
  id: string;
  description: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
}
```

### 7.3 SSE 连接管理

```typescript
// lib/sse/sse-manager.ts

// canvasId → Set<WritableStream> 的映射
// 一个画布可以有多个 SSE 客户端（多标签页）

const connections = new Map<string, Set<WritableStream>>();

export function addConnection(canvasId: string, stream: WritableStream): void {
  if (!connections.has(canvasId)) {
    connections.set(canvasId, new Set());
  }
  connections.get(canvasId)!.add(stream);
}

export function removeConnection(canvasId: string, stream: WritableStream): void {
  connections.get(canvasId)?.delete(stream);
}

export function emit(canvasId: string, event: SSEEvent): void {
  const streams = connections.get(canvasId);
  if (!streams) return;
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const stream of streams) {
    try {
      const writer = stream.getWriter();
      writer.write(new TextEncoder().encode(data));
      writer.releaseLock();
    } catch {
      // 客户端已断开，下次心跳清理
    }
  }
}
```

### 7.4 SSE Route 实现

```typescript
// app/api/canvas/[id]/sse/route.ts

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 发送初始连接确认
      controller.enqueue(encoder.encode(": connected\n\n"));

      // 注册连接
      const writable = new WritableStream({
        write(chunk) {
          controller.enqueue(chunk);
        },
        close() {
          controller.close();
        },
        abort() {
          controller.error("客户端断开");
        },
      });
      addConnection(id, writable);

      // 心跳
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeConnection(id, writable);
        }
      }, 15000);

      // 客户端断开时清理
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        removeConnection(id, writable);
      };

      // 监听请求取消
      _req.signal?.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 7.5 同步模式（Phase 1 使用）

在 Phase 1（无 SSE 时），`/api/canvas/[id]/command` 直接返回完整结果：

```typescript
// POST 返回
{
  response: "好的，画了一个红色矩形",
  objects: [...],   // 更新后的完整 objects 数组
  summary: { total: 1, success: 1, failed: 0, skipped: 0 }
}
```

前端拿到后直接 `setObjects(data.objects)`。这个模式和现有 `PaintPageClient` 的 state 管理完全兼容。

---

## 八、持久化

### 8.1 写入时机

```
POST /api/canvas/[id]/command:
  1. task-generate 完成 → INSERT commands 行
  2. 每个 task 完成后 → INSERT tasks 行
  3. 全部完成后 → UPDATE canvases SET state = ..., version = version + 1
```

### 8.2 与现有 schema 的对齐

现有三张表结构不变，仅明确 JSON 字段的内容约定：

**commands 表**：
| 字段 | 内容 |
|---|---|
| `plan` | task-generate 输出的完整 TaskPlan JSON（tasks + response） |
| `snapshot_before` | 指令执行前的 `{"objects":[...]}` |
| `total_tasks` | `plan.tasks.length` |
| `completed_tasks` | status=SUCCESS 的数量 |
| `failed_tasks` | status=FAILED 的数量 |
| `is_undo` | 0（正常指令）/ 1（undo 指令） |

**tasks 表**：
| 字段 | 内容 |
|---|---|
| `task_type` | CREATE / MODIFY / DELETE / CONNECT |
| `params` | TaskParams JSON（已解析 ref 后的最终值） |
| `depends_on_task_id` | JSON 数组字符串，如 `'["task_0","task_1"]'` |
| `output_ops` | 本任务产生的操作 JSON（用于 audit trail） |
| `output_object_id` | 创建/修改后的对象 id |
| `used_llm` | 0（纯硬编码）/ 1（调用了子工作流 LLM） |

### 8.3 Undo 实现

```typescript
async function undoCommand(canvasId: string): Promise<void> {
  const db = getDb();

  // 找到最近一条非 undo 的 command
  const lastCmd = db.select().from(commands)
    .where(eq(commands.canvasId, canvasId))
    .orderBy(desc(commands.seq))
    .limit(1)
    .get();

  if (!lastCmd || lastCmd.isUndo) return;
  if (!lastCmd.snapshotBefore) return;

  // 恢复快照
  const snapshot = JSON.parse(lastCmd.snapshotBefore);

  db.update(canvases)
    .set({
      state: JSON.stringify(snapshot),
      updatedAt: now(),
    })
    .where(eq(canvases.id, canvasId))
    .run();

  // 记录 undo command
  db.insert(commands).values({
    id: uuid(),
    canvasId,
    seq: lastCmd.seq + 1,
    inputText: "<<UNDO>>",
    plan: null,
    aiResponse: "已撤销上一步操作",
    snapshotBefore: null,
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    isUndo: 1,
    latencyMs: 0,
    createdAt: now(),
  }).run();
}
```

---

## 九、前端集成

### 9.1 Phase 1 集成方式（同步模式，推荐先实现）

对 `ChatPanel` 和 `PaintPageClient` 的改动最小化：

```
ChatPanel 发送消息:
  POST /api/canvas/[id]/command
  body: { message: "画一个红色矩形", canvasState: objects }

  返回:
  {
    response: "好的，画了一个红色矩形",
    objects: [...旧对象, 新矩形],
    summary: { total: 1, success: 1, failed: 0, skipped: 0 }
  }

ChatPanel 处理返回:
  - 把 response 追加到对话 (assistant 消息)
  - 调用 onObjectsChange(data.objects)
  → RoughCanvas 自动全量重绘
```

### 9.2 Phase 3 集成方式（SSE 流式）

```
ChatPanel 发送消息:
  POST /api/canvas/[id]/command
  body: { message: "画登录框和数据库，箭头连接" }

  SSE 连接已在页面加载时建立:
  GET /api/canvas/[id]/sse

SSE 事件序列:
  PLAN_READY  → 显示 AI 回复 + 任务列表
  TASK_RESULT → setObjects(event.canvasState.objects) → 部分对象出现
  TASK_RESULT → setObjects(...) → 更多对象出现
  ALL_DONE    → 完成标记，停止 loading
```

### 9.3 前端 Hook

```typescript
// hooks/use-ai-command.ts
// 封装 SSE 监听 + 发送指令的逻辑

function useAICommand(canvasId: string, onObjectsChange: (objects: DrawObject[]) => void) {
  const [status, setStatus] = useState<"idle" | "planning" | "executing" | "done">("idle");
  const [aiResponse, setAiResponse] = useState("");
  const [taskSummaries, setTaskSummaries] = useState<TaskSummary[]>([]);
  const [summary, setSummary] = useState<{total:number;success:number;failed:number} | null>(null);

  const sendCommand = useCallback(async (message: string) => {
    setStatus("planning");
    // Phase 1: 直接 POST + 等返回
    const res = await fetch(`/api/canvas/${canvasId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    setAiResponse(data.response);
    onObjectsChange(data.objects);
    setSummary(data.summary);
    setStatus("done");
    return data.response;
  }, [canvasId, onObjectsChange]);

  return { status, aiResponse, taskSummaries, summary, sendCommand };
}
```

---

## 十、完整文件组织

```
lib/
├── llm/                              # ✅ 已实现
│   ├── index.ts                      #   统一导出
│   ├── types.ts                      #   ILLMProvider, LLMChatOptions, LLMChatResult
│   └── provider.ts                   #   OpenAI 兼容实现 + 单例
│
├── types/                            # 类型定义
│   ├── task.ts                       #   TaskNode, TaskParams 等
│   └── workflow.ts                   #   CanvasState, TaskGenerateInput, TaskPlan
│
├── workflow/                         # 工作流（LLM 调用）
│   ├── task-generate.ts              #   第一层：意图 → TaskPlan
│   └── sub-workflows/
│       ├── create-sub-workflow.ts    #   第二层：CREATE 样式细化
│       ├── modify-sub-workflow.ts    #   第二层：MODIFY 属性解析
│       ├── connect-sub-workflow.ts   #   第二层：CONNECT 样式处理
│       └── index.ts
│
├── orchestrator/                     # 编排层
│   ├── orchestrator.ts               #   runOrchestrator 主函数
│   ├── topo-sort.ts                  #   拓扑排序
│   └── cycle-detect.ts              #   循环依赖检测
│
├── handlers/                         # Handler 层
│   ├── handler-registry.ts           #   Handler 注册/路由
│   ├── create-handler.ts             #   CREATE → DrawObject
│   ├── modify-handler.ts             #   MODIFY → 更新后的 DrawObject
│   ├── delete-handler.ts             #   DELETE → 删除（纯硬编码）
│   ├── connect-handler.ts            #   CONNECT → 连线 DrawObject
│   └── utils.ts                      #   findObjectById, clampPosition, avoidOverlap, applyChanges
│
├── sse/                              # SSE 通信
│   ├── sse-types.ts                  #   SSEEvent 类型
│   ├── sse-manager.ts                #   连接管理
│   └── sse-emitter.ts               #   消息推送封装
│
└── persistence/                      # 持久化操作
    ├── command-repo.ts               #   commands 表读写
    ├── task-repo.ts                  #   tasks 表读写
    └── session-loader.ts             #   加载 canvasState + recentCommands

app/api/canvas/[id]/
├── command/
│   └── route.ts                      #   POST 指令入口
├── sse/
│   └── route.ts                      #   GET SSE 连接
└── route.ts                          #   GET/PUT/DELETE 画布 CRUD（已有）
```

---

## 十一、分阶段实施路线

### Phase 1：端到端最简路径（1-2 天）

**目标**：说"画一个红色矩形"→ 画布上出现红色矩形

**交付物**：
1. `lib/types/task.ts` — TaskNode 等类型
2. `lib/types/workflow.ts` — CanvasState, TaskPlan
3. `lib/workflow/task-generate.ts` — 第一层 LLM 调用（只支持 CREATE）
4. `lib/workflow/sub-workflows/create-sub-workflow.ts` — 样式补全
5. `lib/handlers/handler-registry.ts` + `create-handler.ts` + `utils.ts`
6. `lib/orchestrator/topo-sort.ts` + `orchestrator.ts`（极简版，单层串行）
7. `lib/persistence/command-repo.ts` + `task-repo.ts` + `session-loader.ts`
8. `app/api/canvas/[id]/command/route.ts` — 同步 POST 端点
9. 前端 ChatPanel 对接（在现有 ChatPanel 中发送 `/api/canvas/[id]/command`）

### Phase 2：全 TaskType + Undo（1-2 天）

**交付物**：
1. ModifyHandler + ModifySubWorkflow
2. DeleteHandler（纯硬编码）
3. ConnectHandler + ConnectSubWorkflow
4. Undo 功能
5. Canvas 文字渲染支持（在 RoughCanvas 中实现 label 叠加）

### Phase 3：SSE 流式体验（1 天）

**交付物**：
1. SSE endpoint + 连接管理 + 心跳
2. 前端 `use-ai-command` Hook
3. ChatPanel 进度展示（PLAN_READY → TASK_RESULT → ALL_DONE）

### Phase 4：优化（持续）

1. canvasState 摘要/过滤（token 成本优化）
2. 同层任务并行化（大规模场景）
3. CreateSubWorkflow 高级视觉（复杂图形组合）
4. 连线路由避障
5. 画布文字直接显示（当前 RoughCanvas 不支持 label 渲染）

---

## 十二、Prompt 设计关键约束

task-generate 的 system prompt 必须硬编码以下约束（与现有 RoughCanvas 的实际能力严格对齐）：

```
## 可用的绘制类型

### 形状（type + 包围盒）
- "rect": 矩形，x, y, w, h 定义左上角 + 宽高
- "circle": 圆形，x, y, w, h 定义外接矩形（w = h）
- "ellipse": 椭圆，x, y, w, h 定义外接矩形
- "diamond": 菱形，x, y, w, h 定义外接矩形

### 连线（type + 两点坐标）
- "arrow": 带箭头直线
- "arc-arrow": 弧线箭头
- "line": 无箭头直线
- "dashed": 虚线

### 填充样式（fillStyle）
- "solid": 实色填充
- "hachure": 斜线阴影（手绘感最强）
- "cross-hatch": 交叉阴影
- "dots": 散点
- "dashed": 虚线填充
- "zigzag": 锯齿

## 坐标系
- 原点 (0, 0) 在左上角
- X 轴向右为正，Y 轴向下为正
- 画布尺寸: {canvasWidth} × {canvasHeight}
- 所有坐标和尺寸必须是正整数
- 建议对象间距 >= 40px
- 所有对象必须在画布边界内（留 10px 边距）

## 默认样式
{ fill: "#ffffff", stroke: "#1a1a1a", strokeWidth: 2, fillStyle: "hachure", roughness: 0.5 }
```
