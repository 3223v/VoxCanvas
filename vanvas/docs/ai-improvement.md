# AI 绘图系统效果分析与优化方案

---

## 一、问题诊断：强大的编排架构，平庸的输出效果

当前系统架构成熟：两层 LLM + DAG 编排 + 四个 Handler + 拓扑排序 + ref 引用解析。但实际绘图效果一般。对比分析：

| 环节 | 设计投入 | 实际表现 |
|---|---|---|
| 编排器 | 拓扑排序、canvasState 增量更新、ref 解析 | ✅ 工作正常 |
| Handler | 重叠检测、边界约束、坐标计算 | ✅ 硬编码精准 |
| 子工作流 | 样式选择、changeHint 解析 | ⚠️ 基本可用 |
| **task-generate** | 单次 LLM 调用，~160 行 prompt | ❌ **整个系统的瓶颈** |

**结论：task-generate 是唯一瓶颈。**它承担了太多职责——意图理解、目标定位、实体提取、关系推理、任务拆解、依赖声明——全部塞进一次 LLM 调用。prompt 是扁平化的规则列表，没有思维链引导，没有充分示例。

---

## 二、task-generate prompt 的具体问题

### 2.1 扁平规则列表 → 缺乏推理结构

当前 prompt 结构：
```
你是一个绘图指令规划器。你的任务是...
## 画布信息
## 可用的任务类型（共 4 种）
### CREATE
### MODIFY
### DELETE
### CONNECT
## 依赖关系规则
## 位置推理规则
## 输出格式
## 自检清单
```

LLM 看到的是一堵规则墙。没有引导它"**先想清楚再写**"的思维链。它只能一次性输出 JSON，缺乏中间推理步骤来校准自己的理解。

### 2.2 目标定位规则过于模糊

```
如何定位 targetId：
- 按 label 匹配："红色的矩形" → 找 label 或 fill 属性匹配的对象
- 按类型匹配："那个矩形" → 找 type=rect 的对象
- 按位置匹配："左边那个" → 找 x 坐标最小的对象
```

**问题**：这是给 LLM 的"指导原则"，但 LLM 在执行时需要自己从画布状态中找到具体对象。画布可能有 20 个矩形，"那个矩形"到底指哪个？LLM 缺乏明确的匹配算法。

### 2.3 缺少 few-shot 示例

当前 prompt 只有一个 CREATE 示例（§二的输出格式段），没有：
- MODIFY 的示例
- DELETE 的示例
- CONNECT 的示例
- 复合指令（多任务 DAG）的示例
- 错误情况（找不到目标时怎么处理）的示例

LLM 只能从规则描述中推断，而非从具体示例中学习模式。

### 2.4 空间推理缺失

"画三个矩形，水平排列，中间放一个圆形"——当前 prompt 没有引导 LLM 做空间布局规划。LLM 可能输出三个 `x: 200, y: 100` 的矩形，全部重叠。

当前 prompt 只知道"在 X 右边 = X.x + X.w + 40"，但不知道如何做"均匀分布三个元素"这种布局。

### 2.5 错误处理路径缺失

prompt 的自检清单是让它"自己检查自己"，但 LLM 对自己的错误不敏感。需要显式的错误处理分支：
- 找不到目标 → tasks 为空 + response 说明
- 指令模糊无法确定 → 让 response 追问用户
- 指令超出画布能力 → 在 response 中说明限制

---

## 三、优化方案：拆分 + 增强

### 3.1 核心思路：将 task-generate 拆为两阶段

```
当前：1 次 LLM 调用 → { tasks, response }
优化：2 次 LLM 调用 → 中间产物 → { tasks, response }
```

```
用户指令
    ↓
┌─────────────────────────────────────────┐
│ 阶段 1：intent-analyzer（新增）          │
│   输入：指令 + 画布状态                   │
│   输出：IntentAnalysis {                 │
│     intent: "create" | "modify" | ...    │
│     entities: [{ 从指令中提取的实体 }]     │
│     spatialHints: "水平排列" | "居中" ... │
│     uncertainty: "..."  (不确定的地方)     │
│   }                                     │
│   调用次数：每条指令 1 次                 │
└──────────────┬──────────────────────────┘
               ↓  IntentAnalysis
┌──────────────────────────────────────────┐
│ 阶段 2：task-planner（增强版 task-generate）│
│   输入：IntentAnalysis + 画布状态 + 历史   │
│   输出：TaskPlan { tasks[], response }    │
│   调用次数：每条指令 1 次                  │
└──────────────────────────────────────────┘
               ↓  TaskPlan
           编排器 → Handler → 画布
```

**为什么拆成两阶段有效？**

1. **职责分离**：阶段 1 只做 NLU（自然语言理解），阶段 2 只做规划。每阶段的 prompt 可以更专注。
2. **中间产物可校验**：IntentAnalysis 是结构化 JSON，可以在进入阶段 2 之前做规则校验（如实体数量是否合理）。
3. **可降级**：阶段 1 失败时可以安全退出（给用户追问），不会浪费阶段 2 的 token。
4. **思维链天然嵌入**：阶段 1 的"理解"作为阶段 2 的输入，避免了一次调用中"边理解边规划"的混乱。

### 3.2 阶段 1：intent-analyzer

**文件**：`lib/workflow/intent-analyzer.ts`

**System Prompt 核心**：

```
你是一个绘图指令理解器。你的任务**不是**规划如何绘图，
而是理解用户的自然语言指令，提取关键信息。

## 输出格式（严格 JSON）
{
  "intent": "create" | "modify" | "delete" | "connect" | "composite" | "query" | "unclear",
  "entities": [
    {
      "type": "shape" | "connection" | "modification" | "deletion",
      "mentionedAs": "用户原文中怎么称呼它的",      // 如 "登录框"
      "shape": "rect" | "circle" | "ellipse" | "diamond" | null,
      "attributes": {
        "color": "红" | "蓝" | ... | null,           // 用户提到的颜色
        "style": "醒目" | "柔和" | ... | null,       // 用户提到的风格
        "size": "大" | "小" | ... | null,            // 用户提到的大小
        "position": "居中" | "左上角" | ... | null   // 用户提到的位置
      },
      // 如果 entity 是修改/删除操作，尝试匹配画布上的目标
      "candidateTargetId": null | "obj_xxx",
      "candidateTargetReason": "为什么匹配这个目标"
    }
  ],
  "spatialLayout": {
    "arrangement": "horizontal" | "vertical" | "grid" | "single" | "freeform",
    "count": 3,
    "spacing": "均匀" | "紧凑" | "宽松" | null
  },
  "uncertainty": "如果有什么不确定的地方，在这里说明",
  "requiresClarification": false  // 是否需要反问用户
}
```

**为什么这样设计？**

- `entities[].mentionedAs` — 记录了用户原文中的称呼，阶段 2 用它做 label 命名
- `candidateTargetId` — 阶段 1 尝试在画布上匹配目标，把匹配结果和理由写下来。阶段 2 可以直接用或覆盖
- `spatialLayout` — 专门提取空间布局意图（水平/垂直/网格），阶段 2 用它计算精确坐标
- `uncertainty` — 让 LLM 说出自己不确定的地方，阶段 2 看到后会更加谨慎
- `requiresClarification` — 指令真的不清楚时，要求反问用户，不强行猜测

**User Message 构造**：

```
## 当前画布状态
<objects JSON 摘要 — 只传 id, type, label, x, y, w, h, stroke, fill>

## 最近指令
<recentCommands>

## 用户当前指令
<currentCommand>

请先理解用户的意图，提取关键信息。
不要规划如何绘制，只需要理解。
```

### 3.3 阶段 2：task-planner（增强版 task-generate）

**文件**：`lib/workflow/task-planner.ts`（替代现有 task-generate.ts）

**核心改进**：收到阶段 1 的结构化理解后，阶段 2 只需要做"翻译"——把理解结果映射为具体任务。

**System Prompt 改进点**：

#### a) 丰富的 few-shot 示例（至少覆盖 6 个场景）

```
## Few-Shot 示例

### 示例 1：简单创建
用户: "画一个红色矩形"
理解: { intent: "create", entities: [{ type: "shape", mentionedAs: "红色矩形", ... }] }
输出:
{
  "tasks": [{
    "id": "task_0",
    "taskType": "CREATE",
    "description": "创建红色矩形",
    "params": {
      "shape": "rect", "x": 480, "y": 300,
      "w": 120, "h": 80, "label": "红色矩形",
      "visualHint": "红色填充，醒目"
    },
    "dependsOn": []
  }],
  "response": "好的，画了一个红色矩形。"
}

### 示例 2：复合创建 + 连线
用户: "画登录框和数据库，用箭头连接"
理解: { intent: "composite", entities: [
  { type: "shape", mentionedAs: "登录框", shape: "rect" },
  { type: "shape", mentionedAs: "数据库", shape: "ellipse" },
  { type: "connection", mentionedAs: "箭头" }
]}
输出:
{
  "tasks": [
    { "id": "task_0", "taskType": "CREATE", "description": "创建登录框",
      "params": { "shape": "rect", "x": 300, "y": 200, "w": 140, "h": 60, "label": "登录" },
      "dependsOn": [] },
    { "id": "task_1", "taskType": "CREATE", "description": "创建数据库",
      "params": { "shape": "ellipse", "x": 300, "y": 340, "w": 140, "h": 80, "label": "数据库" },
      "dependsOn": [] },
    { "id": "task_2", "taskType": "CONNECT", "description": "箭头连接",
      "params": { "fromId": "ref:task_0.output.id", "toId": "ref:task_1.output.id", "arrowType": "single" },
      "dependsOn": ["task_0", "task_1"] }
  ],
  "response": "好的，创建了登录框和数据库，并用箭头连接。"
}

### 示例 3：修改已有对象
用户: "把登录框改成蓝色"
理解: { intent: "modify", entities: [{ type: "modification", mentionedAs: "登录框",
       candidateTargetId: "obj_abc", candidateTargetReason: "label 为'登录'的矩形" }]}
输出:
{
  "tasks": [{
    "id": "task_0", "taskType": "MODIFY",
    "description": "将登录框改为蓝色",
    "params": { "targetId": "obj_abc", "changes": { "changeHint": "蓝色填充" } },
    "dependsOn": []
  }],
  "response": "好的，把登录框改成了蓝色。"
}

### 示例 4：删除
用户: "删掉那个数据库"
理解: { intent: "delete", entities: [{ type: "deletion", mentionedAs: "数据库",
       candidateTargetId: "obj_def", ... }]}
输出:
{
  "tasks": [{ "id": "task_0", "taskType": "DELETE",
    "params": { "targetId": "obj_def" }, "dependsOn": [] }],
  "response": "好的，删除了数据库（连到它的线也一起删了）。"
}

### 示例 5：空间布局 — 水平排列
用户: "画三个矩形，水平均匀排列"
理解: { intent: "create", entities: [{type:"shape",mentionedAs:"矩形"}...],
       spatialLayout: { arrangement: "horizontal", count: 3, spacing: "均匀" }}
输出:
{
  "tasks": [
    { "id": "task_0", "taskType": "CREATE", "params": { "shape": "rect",
        "x": 200, "y": 360, "w": 100, "h": 80, "label": "步骤1" }, "dependsOn": [] },
    { "id": "task_1", "taskType": "CREATE", "params": { "shape": "rect",
        "x": 400, "y": 360, "w": 100, "h": 80, "label": "步骤2" }, "dependsOn": [] },
    { "id": "task_2", "taskType": "CREATE", "params": { "shape": "rect",
        "x": 600, "y": 360, "w": 100, "h": 80, "label": "步骤3" }, "dependsOn": [] }
  ],
  "response": "好的，画了三个水平均匀排列的矩形。"
}
// 注意：坐标由 task-planner 在 CoT 中计算后直接填入
// 画布 1200×800，三个 100×80 矩形的中心间距 = (1200 - 3×100) / 4 = 225,
// x 坐标分别为 225, 450, 675

### 示例 6：找不到目标
用户: "把那个五角星删掉"
理解: { intent: "delete", entities: [{type:"deletion", mentionedAs:"五角星", candidateTargetId: null}] }
输出:
{
  "tasks": [],
  "response": "抱歉，我在画布上没有找到五角星。你能再描述一下它在哪里吗？"
}
```

#### b) 空间布局推理指南

```
## 空间布局算法

当用户要求多个对象按特定方式排列时，你需要自己计算坐标。

### 水平均匀排列 N 个 w×h 的对象在 1200×800 画布上：
  总宽度 = N × w
  剩余空间 = 1200 - 总宽度
  间距 = 剩余空间 / (N + 1)
  第 i 个对象的 x = 间距 + i × (w + 间距)
  y = (800 - h) / 2  (垂直居中)

### 垂直均匀排列：
  同理，交换 x/y 和 w/h

### 网格排列 (rows × cols)：
  水平方向按 cols 均匀分布
  垂直方向按 rows 均匀分布
  每个对象放置在其网格单元内居中

### 相对位置（对象 A 旁边放对象 B）：
  右边：B.x = A.x + A.w + 40, B.y = A.y
  下边：B.x = A.x, B.y = A.y + A.h + 40
```

#### c) 输出前的 CoT（思维链）要求

```
## 输出前请先在心中完成以下推理（体现在 response 的详细程度中）：

1. 用户想做什么？创建/修改/删除/连线？
2. 涉及几个对象？它们之间有什么关系？
3. 哪些是画布上已有的？（targetId 是什么？为什么匹配它？）
4. 哪些需要新建？（用什么形状？大致在什么位置？）
5. 任务之间的依赖关系是什么？
6. 有没有什么不确定的地方？

如果任何一步不确定，在 response 中向用户确认，不要强行猜测。
```

---

## 四、子工作流 prompt 增强

### 4.1 CreateSubWorkflow 增强

**当前问题**：颜色选择太保守（总是 hachure + 灰色系），缺乏场景感知。

**增强方向**：

```
## 场景感知样式选择

根据对象在系统中的角色选择样式：

### 流程图场景
- 开始/结束 → circle, solid 填充, 柔和绿/蓝色, roughness 0.3
- 处理步骤 → rect, hachure, 暖黄色, roughness 0.6
- 判断条件 → diamond, solid, 橙色, roughness 0.4
- 数据库/存储 → ellipse, cross-hatch, 蓝色系, roughness 0.5

### UI 原型场景
- 按钮 → rect, solid 填充, 圆角暗示（通过 roughness 0.2）
- 输入框 → rect, 无填充, 细边框(strokeWidth 1)
- 卡片 → rect, solid 填充, 浅灰背景, 细边框

### 架构图场景
- 服务/微服务 → circle, hachure, 蓝色系
- 数据库 → ellipse, cross-hatch, 深蓝
- 消息队列 → rect, dashed 填充
- 负载均衡 → diamond, solid

## 颜色协调规则
- 相邻对象使用互补色或类似色
- 同类型对象使用相同色系不同深浅
- 最多使用 3-4 种主色，避免花哨
```

### 4.2 ModifySubWorkflow 增强

增加更多 changeHint 映射 + 相对修改能力：

```
"换个风格" → 在几种预设风格间轮换：
  "手绘风" → hachure + roughness 1.2 + 暖色
  "简洁风" → solid + roughness 0.3 + 冷色
  "正式风" → cross-hatch + roughness 0.5 + 深色

"对齐到..." → 计算与参照对象的对齐位置

"和 XX 一样" → 复制 XX 的 style
```

---

## 五、增加校验层

在 task-planner 输出和 Orchestrator 执行之间，增加一个**纯规则校验层**：

```typescript
// lib/workflow/plan-validator.ts

function validatePlan(plan: TaskPlan, canvasState: CanvasState): ValidationResult {
  const warnings: string[] = [];

  for (const task of plan.tasks) {
    // 1. 坐标边界检查
    if (task.taskType === "CREATE") {
      const { x, y, w, h } = task.params as CreateParams;
      if (x !== undefined && (x < 0 || x + (w ?? 100) > canvasState.meta.canvasWidth))
        warnings.push(`${task.id}: x 坐标超出画布`);
      if (y !== undefined && (y < 0 || y + (h ?? 80) > canvasState.meta.canvasHeight))
        warnings.push(`${task.id}: y 坐标超出画布`);
    }

    // 2. targetId 存在性检查
    if (task.taskType === "MODIFY" || task.taskType === "DELETE") {
      const { targetId } = task.params as ModifyParams;
      if (!targetId.startsWith("ref:") && !canvasState.objects.find(o => o.id === targetId))
        warnings.push(`${task.id}: targetId "${targetId}" 不在画布上`);
    }

    // 3. 重叠检查
    // 检查同一 layer 的 CREATE 任务是否重叠
  }

  return { valid: warnings.length === 0, warnings };
}
```

这个校验层**不调 LLM**，纯粹是规则检查。发现 warnings 时可以：
- 自动修正（如 clamp 坐标）
- 或返回给前端展示
- 或触发 task-planner 重试（仅严重错误时）

---

## 六、预期效果对比

| 场景 | 当前表现 | 优化后预期 |
|---|---|---|
| "画一个红色矩形" | ✅ 正常 | ✅ 正常 |
| "画登录框和数据库，箭头连接" | ⚠️ 偶尔位置重叠 | ✅ DAG 正确 + 位置合理 |
| "画三个矩形水平均匀排列" | ❌ 三个重叠在一起 | ✅ 均匀分布 |
| "把左边那个圆的颜色改一下" | ❌ 找不到目标 | ✅ 正确匹配 |
| "画一个五角星" | ❌ 强行创建 rect | ✅ 明确告知不支持 |
| "画一个简单的登录流程图" | ⚠️ 创建 1-2 个对象 | ✅ 理解"流程"→多个步骤+箭头 |
| "把整个图往右挪一点" | ❌ 不支持批量操作 | ✅ 生成 N 个 MODIFY task |

---

## 七、实施建议

分两步走，不追求一次性完美：

### 第一步（立即）：增强现有 task-generate prompt

1. 在现有 task-generate prompt 中**加入 6 个 few-shot 示例**
2. 加入**空间布局推理指南**（水平/垂直/网格的坐标计算公式）
3. 加入**输出前 CoT 指引**（在 response 中体现推理过程）
4. 改进**错误处理分支**（找不到目标 → tasks=[] + response 追问）

这些改动不需要修改任何代码逻辑，只改 prompt 字符串。风险极低，效果立竿见影。

### 第二步（后续）：拆分两阶段 + 增加校验层

1. 实现 `intent-analyzer.ts`（阶段 1）
2. 实现 `task-planner.ts`（阶段 2，基于增强后的 prompt）
3. 实现 `plan-validator.ts`（规则校验层）
4. 更新 `command/route.ts`：intent-analyzer → task-planner → validator → orchestrator
5. 子工作流 prompt 增强（场景感知样式）
