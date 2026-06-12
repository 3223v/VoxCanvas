# task-generate 工作流设计文档

---

## 1. 概述

### 1.1 定位

task-generate 是语音绘图系统的核心工作流，负责将用户的自然语言指令解析为结构化的可执行任务计划（DAG）。

```
用户语音 → ASR → 文本
                    ↓
          ┌─────────────────────────────┐
          │     task-generate 工作流     │
          │                             │
          │  输入:                       │
          │    - canvasState (画布状态)   │
          │    - recentCommands (历史)   │
          │    - currentCommand (当前)   │
          │                             │
          │  输出:                       │
          │    - tasks[] (任务 DAG)      │
          │    - response (自然语言回复)  │
          │                             │
          │  核心: 1 次 LLM 调用          │
          └─────────────────────────────┘
                    ↓
              编排器 → 任务执行器 → Rough.js 渲染
```

### 1.2 设计目标

| 目标 | 说明 |
|---|---|
| 理解准确 | 自然语言指令被正确拆解为任务列表 |
| 结构完整 | 每个任务有明确类型、参数和依赖关系 |
| 位置合理 | 新建对象坐标不与已有对象重叠，符合用户空间意图 |
| 即时反馈 | 返回自然语言回复，可用于 TTS 语音播报 |
| 成本可控 | 单次指令只调用 1 次 LLM |

### 1.3 技术决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 工作流引擎 | 手动函数调用 | 本质是一次 LLM 调用加解析校验，不是图结构 |
| LLM 调用次数 | 1 次 | 强模型 + 结构化输出 + 精心设计的 prompt 足够 |
| 输出格式 | JSON Object（强制） | 避免自由文本解析 |
| 温度参数 | 0.1 | 低温度确保输出稳定 |
| 依赖模型 | DAG（有向无环图） | 真实场景一个任务可依赖多个前驱，树结构无法表达 |

---

## 2. 接口定义

### 2.1 输入类型

```typescript
interface TaskGenerateInput {
  canvasState: CanvasState;
  recentCommands: string[];       // 最近 5 条指令原文
  currentCommand: string;
}

interface CanvasState {
  objects: CanvasObject[];
  meta: CanvasMeta;
}

interface CanvasObject {
  id: string;                     // 唯一标识，如 "node_1"
  type: ShapeType;                // "rect" | "circle" | "ellipse" | "diamond" | "hexagon"
  x: number;                      // 左上角 X
  y: number;                      // 左上角 Y
  w: number;                      // 宽度
  h: number;                      // 高度
  label: string;                  // 显示文字
  style: ShapeStyle;
}

interface CanvasMeta {
  canvasWidth: number;            // 默认 1200
  canvasHeight: number;           // 默认 800
}

interface ShapeStyle {
  fill: string;                   // 十六进制填充色
  stroke: string;                 // 十六进制边框色
  strokeWidth: number;
  fillStyle: "hachure" | "solid" | "cross-hatch" | "dots";
  roughness: number;              // 0~2
}
```

### 2.2 输出类型

```typescript
interface TaskPlan {
  tasks: TaskNode[];
  response: string;               // AI 自然语言回复
}

interface TaskNode {
  id: string;                     // "task_0", "task_1", ...
  taskType: TaskType;
  description: string;            // 人类可读描述
  params: TaskParams;
  dependsOn: string[];            // 依赖的前序任务 id 列表
}

type TaskType = "CREATE" | "MODIFY" | "DELETE" | "CONNECT";

type TaskParams =
  | CreateParams
  | ModifyParams
  | DeleteParams
  | ConnectParams;
```

---

## 3. TaskType 规范

### 3.1 CREATE — 创建新图形

**语义：** 在画布上创建一个新图形对象。

```typescript
interface CreateParams {
  shape: "rect" | "circle" | "ellipse" | "diamond" | "hexagon";
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  style?: Partial<ShapeStyle>;
}
```

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| shape | enum | 是 | 5 种形状之一 |
| x | number | 是 | ≥ 0，x + w ≤ canvasWidth |
| y | number | 是 | ≥ 0，y + h ≤ canvasHeight |
| w | number | 是 | > 0，建议 60~300 |
| h | number | 是 | > 0，建议 40~200 |
| label | string | 否 | 空字符串表示无标签 |
| style | object | 否 | 缺省使用默认样式 |

默认样式：

```json
{
  "fill": "#ffffff",
  "stroke": "#000000",
  "strokeWidth": 2,
  "fillStyle": "hachure",
  "roughness": 1.5
}
```

**dependsOn 规则：**
- 通常为空数组 `[]`
- 仅当坐标需要引用前序任务输出时才填写

### 3.2 MODIFY — 修改已有图形

**语义：** 修改画布上已有图形的任意属性，包括位置、尺寸、样式、文字。

```typescript
interface ModifyParams {
  targetId: string;               // 画布已有对象 id，或 "ref:task_N.output.id"
  changes: {
    // 位置
    x?: number;                   // 绝对坐标
    y?: number;
    dx?: number;                  // 相对偏移，正数向右/下
    dy?: number;

    // 尺寸
    w?: number;
    h?: number;

    // 内容
    label?: string;

    // 样式（合并，只传变化部分）
    style?: Partial<ShapeStyle>;
  };
}
```

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| targetId | string | 是 | 画布已有对象 id 或 ref 引用 |
| changes | object | 是 | 至少包含一个变化字段 |
| changes.x / y | number | 否 | 绝对坐标 |
| changes.dx / dy | number | 否 | 相对偏移量 |
| changes.w / h | number | 否 | 新尺寸 |
| changes.label | string | 否 | 新文字 |
| changes.style | object | 否 | 与原样式合并 |

**位置修改对照：**

| 用户表述 | changes 字段 |
|---|---|
| "移到 (300, 200)" | `{ x: 300, y: 200 }` |
| "往右挪一下" | `{ dx: 50 }` |
| "往上面挪一点" | `{ dy: -40 }` |
| "挪一下再改成蓝色" | `{ dx: 30, style: { fill: "#4a90d9" } }` |

**dependsOn 规则：**
- 操作画布已有对象 → `[]`
- 操作本次新建的对象 → `["task_N"]`

### 3.3 DELETE — 删除已有图形

**语义：** 从画布上移除一个图形对象。

```typescript
interface DeleteParams {
  targetId: string;
}
```

**dependsOn 规则：**
- 操作画布已有对象 → `[]`
- 操作本次新建的对象 → `["task_N"]`

### 3.4 CONNECT — 连接两个图形

**语义：** 在两个图形之间画一条连线或箭头。

```typescript
interface ConnectParams {
  fromId: string;                 // 起始对象 id 或 ref 引用
  toId: string;                   // 终止对象 id 或 ref 引用
  label?: string;                 // 连线标注
  arrowType?: "single" | "double" | "none";
  style?: {
    stroke?: string;
    strokeWidth?: number;
  };
}
```

| 字段 | 类型 | 必填 | 约束 |
|---|---|---|---|
| fromId | string | 是 | 有效对象 id 或 ref 引用 |
| toId | string | 是 | 有效对象 id 或 ref 引用 |
| label | string | 否 | 连线上的文字标注 |
| arrowType | enum | 否 | 默认 "single" |
| style.stroke | string | 否 | 默认 "#333333" |
| style.strokeWidth | number | 否 | 默认 2 |

**dependsOn 规则：**
- 两端都是画布已有对象 → `[]`
- 一端是本次新建 → `["task_N"]`
- 两端都是本次新建 → `["task_N", "task_M"]`

---

## 4. 依赖关系设计

### 4.1 DAG 模型

采用有向无环图（DAG），每个任务通过 `dependsOn` 声明前驱依赖。

```
"画登录框和数据库，箭头连接，全部改成蓝色"

task_0 (CREATE 登录框) ─────→ task_2 (CONNECT) ──→ task_3 (MODIFY 登录)
                              ↑
task_1 (CREATE 数据库) ──────┘────────────────────→ task_4 (MODIFY 数据库)

task_0: dependsOn = []
task_1: dependsOn = []
task_2: dependsOn = ["task_0", "task_1"]     ← 两个前驱
task_3: dependsOn = ["task_0", "task_2"]
task_4: dependsOn = ["task_1", "task_2"]
```

### 4.2 dependsOn 声明规则汇总

| 任务类型 | 对象来源 | dependsOn |
|---|---|---|
| CREATE | 无特殊依赖 | `[]` |
| CREATE | 位置依赖前序任务输出 | `["task_N"]` |
| MODIFY | 操作画布已有对象 | `[]` |
| MODIFY | 操作本次新建的对象 | `["task_N"]` |
| DELETE | 同 MODIFY | 同 MODIFY |
| CONNECT | 两端都是已有对象 | `[]` |
| CONNECT | 一端是新建对象 | `["task_N"]` |
| CONNECT | 两端都是新建对象 | `["task_N", "task_M"]` |

### 4.3 拓扑排序（执行计划生成）

将 DAG 转化为分层执行计划，同层内任务可并行执行：

```typescript
interface ExecutionLayer {
  parallel: TaskNode[];
}

function toExecutionLayers(tasks: TaskNode[]): ExecutionLayer[] {
  const completed = new Set<string>();
  const remaining = [...tasks];
  const layers: ExecutionLayer[] = [];

  while (remaining.length > 0) {
    const ready = remaining.filter(t =>
      t.dependsOn.every(dep => completed.has(dep))
    );

    if (ready.length === 0) {
      throw new Error(
        'Circular dependency among: ' +
        remaining.map(t => t.id).join(', ')
      );
    }

    layers.push({ parallel: ready });

    ready.forEach(t => {
      completed.add(t.id);
      remaining.splice(remaining.indexOf(t), 1);
    });
  }

  return layers;
}
```

输出示例：

```
Layer 0: [task_0, task_1]    ← 无依赖，并行
Layer 1: [task_2]            ← 等 task_0 和 task_1 都完成
Layer 2: [task_3, task_4]    ← 各自依赖满足，并行
```

### 4.4 循环依赖检测

```typescript
function detectCircular(tasks: TaskNode[]): string[] | null {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(id: string, path: string[]): string[] | null {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      return path.slice(cycleStart).concat(id);
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

## 5. 引用解析机制

### 5.1 ref 语法

```
"ref:task_N.output.id"

语义：取 task_N 执行完成后输出的画布对象 id
```

### 5.2 可用路径

| 引用路径 | 含义 | 适用场景 |
|---|---|---|
| `ref:task_N.output.id` | 前序任务创建的对象 id | CONNECT 的 fromId/toId, MODIFY 的 targetId |

### 5.3 解析函数

```typescript
interface TaskExecutionResult {
  output: {
    id: string;
    object: CanvasObject;
  };
  status: "SUCCESS" | "FAILED" | "SKIPPED";
}

function resolveRefs(
  params: Record<string, unknown>,
  results: Map<string, TaskExecutionResult>
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.startsWith('ref:')) {
      const path = value.slice(4).split('.');
      const taskId = path[0];
      const result = results.get(taskId);

      if (!result || result.status !== "SUCCESS") {
        throw new Error(`Cannot resolve ${value}: task not found or failed`);
      }

      let resolvedValue: any = result;
      for (const segment of path.slice(1)) {
        resolvedValue = resolvedValue?.[segment];
        if (resolvedValue === undefined) {
          throw new Error(`Cannot resolve ${value}: path "${segment}" not found`);
        }
      }
      resolved[key] = resolvedValue;
    } else if (typeof value === 'object' && value !== null) {
      resolved[key] = resolveRefs(
        value as Record<string, unknown>,
        results
      );
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}
```

### 5.4 混合引用示例

CONNECT 一端是画布已有对象，另一端是新建对象：

```json
{
  "fromId": "node_1",
  "toId": "ref:task_0.output.id"
}
```

解析后：

```json
{
  "fromId": "node_1",
  "toId": "node_2"
}
```

---

## 6. 位置推理规则

### 6.1 绝对位置

| 用户表述 | 计算方式 |
|---|---|
| "画在 (100, 200)" | x=100, y=200 |
| "居中" | x = (canvasWidth - w) / 2, y = (canvasHeight - h) / 2 |
| "左上角" | x=20, y=20 |
| "右下角" | x = canvasWidth - w - 20, y = canvasHeight - h - 20 |

### 6.2 相对位置（间距 40px）

| 用户表述 | 计算方式 |
|---|---|
| "在 X 下面" | x = X.x, y = X.y + X.h + 40 |
| "在 X 右边" | x = X.x + X.w + 40, y = X.y |
| "在 X 上面" | x = X.x, y = X.y - h - 40 |
| "在 X 左边" | x = X.x - w - 40, y = X.y |
| "在 X 旁边" | 默认右边 |

### 6.3 默认位置（无位置信息）

```typescript
function findDefaultPosition(
  objects: CanvasObject[],
  canvasWidth: number,
  canvasHeight: number,
  w: number,
  h: number
): { x: number; y: number } {
  if (objects.length === 0) {
    return {
      x: Math.round((canvasWidth - w) / 2),
      y: Math.round((canvasHeight - h) / 2) - 50,
    };
  }

  const bottomObj = objects.reduce((max, obj) =>
    (obj.y + obj.h) > (max.y + max.h) ? obj : max
  );

  return { x: bottomObj.x, y: bottomObj.y + bottomObj.h + 40 };
}
```

### 6.4 边界约束

```typescript
function clampToCanvas(
  x: number, y: number, w: number, h: number,
  canvasWidth: number, canvasHeight: number
): { x: number; y: number } {
  return {
    x: Math.max(10, Math.min(x, canvasWidth - w - 10)),
    y: Math.max(10, Math.min(y, canvasHeight - h - 10)),
  };
}
```

---

## 7. TaskType 兜底机制

```
Layer 1: prompt 约束 — 只列出 4 种合法值
Layer 2: 别名归一化 — 应用层解析时映射
Layer 3: 无法识别 — 降级为 CREATE
```

别名映射表：

```typescript
const TASK_TYPE_ALIASES: Record<string, TaskType> = {
  create: "CREATE", add: "CREATE", draw: "CREATE",
  new: "CREATE", copy: "CREATE", duplicate: "CREATE",
  insert: "CREATE", place: "CREATE",

  modify: "MODIFY", change: "MODIFY", update: "MODIFY",
  set: "MODIFY", adjust: "MODIFY", resize: "MODIFY",
  style: "MODIFY", color: "MODIFY", move: "MODIFY",
  shift: "MODIFY", relocate: "MODIFY", nudge: "MODIFY",

  delete: "DELETE", remove: "DELETE", erase: "DELETE",

  connect: "CONNECT", link: "CONNECT", join: "CONNECT",
  arrow: "CONNECT", line: "CONNECT", wire: "CONNECT",
};
```

归一化函数：

```typescript
function normalizeTaskType(raw: string): TaskType {
  const normalized = raw?.toLowerCase().trim();
  if (normalized in TASK_TYPE_ALIASES) {
    return TASK_TYPE_ALIASES[normalized];
  }
  return "CREATE";
}
```

---

## 8. Prompt 设计

### 8.1 System Prompt

```
你是一个绘图指令规划器。你的任务是：
1. 理解用户用自然语言描述的绘图需求
2. 将其分解为一组可执行的任务节点
3. 为每个任务计算具体的绘图参数
4. 声明任务之间的依赖关系（有向无环图）

## 画布坐标系
- 原点 (0,0) 在左上角，X 轴向右，Y 轴向下
- 画布尺寸: {canvasWidth} x {canvasHeight}

## 可用的任务类型（共 4 种）

### CREATE — 创建新图形
params:
  shape: "rect" | "circle" | "ellipse" | "diamond" | "hexagon"
  x, y: 左上角坐标（整数）
  w, h: 宽高（整数，> 0）
  label: 显示文字（可为空）
  style.fill: 填充色（十六进制）
  style.stroke: 边框色
  style.strokeWidth: 边框粗细（默认 2）
  style.fillStyle: "hachure" | "solid" | "cross-hatch" | "dots"
  style.roughness: 0~2（默认 1.5）

### MODIFY — 修改已有图形（位置、尺寸、样式、文字均通过此类型）
params:
  targetId: 对象 id（已有对象直接用 id，新建对象用 "ref:task_N.output.id"）
  changes: 只包含要修改的字段
    x, y: 绝对坐标
    dx, dy: 相对偏移（正数向右/下，负数向左/上）
    w, h: 新尺寸
    label: 新文字
    style: 与原样式合并（只传变化部分）

### DELETE — 删除图形
params:
  targetId: 对象 id

### CONNECT — 连接两个图形
params:
  fromId: 起始对象 id（已有用 id，新建用 ref 引用）
  toId: 终止对象 id
  label: 连线标注（可选）
  arrowType: "single" | "double" | "none"（默认 "single"）
  style.stroke: 连线颜色
  style.strokeWidth: 连线粗细

## 依赖关系规则（DAG）

每个任务通过 dependsOn 声明依赖哪些前置任务 id。
空数组 = 无依赖，可立即执行。

规则 1: CREATE 通常 dependsOn = []
规则 2: MODIFY/DELETE 操作已有对象 → dependsOn = []
       操作本次新建的对象 → dependsOn 包含那个 CREATE 任务 id
规则 3: CONNECT 依赖两端对象的创建
       两端都是已有对象 → dependsOn = []
       一端新建 → 包含那个 CREATE 任务 id
       两端新建 → 包含两个 CREATE 任务 id
规则 4: 不允许循环依赖

## 位置推理规则

### 绝对位置
  "画在 (100, 200)" → x=100, y=200
  "居中" → x=(canvasWidth-w)/2, y=(canvasHeight-h)/2
  "左上角" → x=20, y=20

### 相对位置（间距 40px）
  "在 X 下面" → x=X.x, y=X.y+X.h+40
  "在 X 右边" → x=X.x+X.w+40, y=X.y
  "在 X 上面" → x=X.x, y=X.y-h-40
  "在 X 左边" → x=X.x-w-40, y=X.y
  "在 X 旁边" → 默认右边

### 无位置信息
  画布为空 → 居中放置
  画布非空 → 放在最底部对象下方

### 边界约束
  x ≥ 10, y ≥ 10, x+w ≤ canvasWidth-10, y+h ≤ canvasHeight-10

## 目标定位规则（MODIFY/DELETE/CONNECT）

按优先级依次尝试：
  1. label 匹配："把登录框..." → 找 label 含"登录"的对象
  2. 位置匹配："左边那个..." → 找 x 最小的对象
  3. 类型匹配："圆形改成..." → 找 shape=circle 的对象
  4. 序数匹配："第一个..." → 按 objects 数组顺序

找不到目标时，在 response 中说明，并标记 params.targetFound = false
```

### 8.2 输出格式段

```
## 输出格式（严格 JSON，不要输出其他内容）

{
  "tasks": [
    {
      "id": "task_0",
      "taskType": "CREATE",
      "description": "创建登录框",
      "params": {
        "shape": "rect",
        "x": 200,
        "y": 100,
        "w": 160,
        "h": 60,
        "label": "登录",
        "style": {
          "fill": "#e8c547",
          "stroke": "#000000",
          "strokeWidth": 2,
          "fillStyle": "hachure",
          "roughness": 1.5
        }
      },
      "dependsOn": []
    }
  ],
  "response": "已创建一个金色手绘风格的矩形"
}

### 字段规则
  id: "task_0", "task_1", ... 从 0 递增
  taskType: 只能是 CREATE / MODIFY / DELETE / CONNECT
  dependsOn: 引用本输出中其他任务的 id

### 自检清单（输出前逐项检查）
  1. 每个 CREATE 的 x, y, w, h 是否为正整数且在画布范围内？
  2. 新对象是否与已有对象重叠？
  3. MODIFY/DELETE 的 targetId 是否有效？
  4. CONNECT 的 fromId 和 toId 是否都已确定来源？
  5. dependsOn 中引用的 id 是否都存在于 tasks 列表中？
  6. 是否存在循环依赖？
  7. ref 引用是否只指向 CREATE 类型的任务？
```

### 8.3 User Message 构造

```typescript
function buildUserMessage(input: TaskGenerateInput): string {
  const parts: string[] = [];

  parts.push(`## 当前画布状态`);
  if (input.canvasState.objects.length === 0) {
    parts.push(`画布为空，没有任何图形。`);
  } else {
    parts.push(
      '```json\n' +
      JSON.stringify(input.canvasState.objects, null, 2) +
      '\n```'
    );
  }

  if (input.recentCommands.length > 0) {
    parts.push(`\n## 最近的指令（供参考上下文，如指代消歧）`);
    input.recentCommands.forEach((cmd, i) => {
      parts.push(`${i + 1}. ${cmd}`);
    });
  }

  parts.push(`\n## 用户当前指令\n${input.currentCommand}`);

  return parts.join('\n');
}
```

---

## 9. 工作流执行流程

### 9.1 主函数

```typescript
async function taskGenerate(input: TaskGenerateInput): Promise<TaskPlan> {
  // 1. 构建 prompt
  const { system, user } = buildPrompt(input);

  // 2. 调用 LLM
  const raw = await callLLMWithRetry({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  // 3. 解析 JSON
  const parsed = JSON.parse(raw.content);

  // 4. 校验 + 归一化
  const tasks = validateAndNormalize(parsed.tasks ?? []);

  // 5. 循环依赖检测
  const cycle = detectCircular(tasks);
  if (cycle) {
    throw new Error(`Circular dependency: ${cycle.join(' → ')}`);
  }

  // 6. 返回
  return {
    tasks,
    response: parsed.response ?? '已完成',
  };
}
```

### 9.2 校验与归一化

```typescript
function validateAndNormalize(rawTasks: any[]): TaskNode[] {
  return rawTasks.map((t, i) => {
    const taskType = normalizeTaskType(t.taskType);

    return {
      id: t.id ?? `task_${i}`,
      taskType,
      description: String(t.description ?? ''),
      params: validateParams(taskType, t.params ?? {}),
      dependsOn: Array.isArray(t.dependsOn)
        ? t.dependsOn.filter((id: string) => typeof id === 'string')
        : [],
    };
  });
}

function validateParams(taskType: TaskType, params: any): TaskParams {
  switch (taskType) {
    case 'CREATE':
      return {
        shape: params.shape ?? 'rect',
        x: Math.max(0, Math.round(params.x ?? 0)),
        y: Math.max(0, Math.round(params.y ?? 0)),
        w: Math.max(10, Math.round(params.w ?? 100)),
        h: Math.max(10, Math.round(params.h ?? 60)),
        label: params.label ?? '',
        style: params.style ?? undefined,
      };

    case 'MODIFY':
      return {
        targetId: params.targetId ?? '',
        changes: params.changes ?? {},
      };

    case 'DELETE':
      return {
        targetId: params.targetId ?? '',
      };

    case 'CONNECT':
      return {
        fromId: params.fromId ?? '',
        toId: params.toId ?? '',
        label: params.label ?? '',
        arrowType: params.arrowType ?? 'single',
        style: params.style ?? undefined,
      };
  }
}
```

### 9.3 调用链路

```
POST /api/canvas/[id]/command
    │
    ├── 1. 加载画布状态 + 最近指令
    │      loadSession(canvasId) → { canvasState, recentCommands }
    │
    ├── 2. task-generate 工作流
    │      taskGenerate({ canvasState, recentCommands, currentCommand })
    │        → TaskPlan { tasks[], response }
    │
    ├── 3. 持久化
    │      3a. commands 表: { inputText, plan, aiResponse, snapshotBefore, totalTasks }
    │      3b. tasks 表: plan.tasks 展开写入
    │
    └── 4. 返回前端
           { commandId, response, tasks }
```

---

## 10. 容错设计

### 10.1 LLM 输出异常处理

| 异常 | 处理 |
|---|---|
| JSON 解析失败 | 重试 1 次，仍失败返回错误 |
| tasks 为空数组 | 返回空任务 + 引导性回复 |
| taskType 不合法 | 别名归一化，仍无法识别降级为 CREATE |
| 缺少必填字段 | 默认值补全（见 validateParams） |
| 依赖 id 不存在 | 从 dependsOn 移除无效 id |
| 循环依赖 | 抛出错误返回用户 |
| 坐标超出画布 | clampToCanvas 修正 |
| targetId 找不到目标 | 标记 SKIPPED，response 中提示 |

### 10.2 重试策略

```typescript
async function callLLMWithRetry(
  options: LLMCallOptions,
  maxRetries: number = 1
): Promise<LLMCallResult> {
  let lastError: Error | null = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await callLLM(options);
      JSON.parse(result.content);
      return result;
    } catch (e) {
      lastError = e as Error;
      if (i < maxRetries) await new Promise(r => setTimeout(r, 500));
    }
  }

  throw lastError;
}
```

---

## 11. 成本估算

```
输入 token:
  system prompt          ≈ 800
  canvasState (10个对象)  ≈ 1000
  recentCommands (5条)    ≈ 200
  currentCommand          ≈ 50
  合计                    ≈ 2050

输出 token:
  tasks JSON (5个任务)    ≈ 800
  response                ≈ 50
  合计                    ≈ 850

单次成本:
  GPT-4o:    2050 × $2.5/M + 850 × $10/M ≈ $0.014 (≈ ¥0.1)
  DeepSeek:  2050 × ¥1/M + 850 × ¥2/M    ≈ ¥0.004
```