# AI 绘图工作流：提示词注入与执行机制详解

本文档逐一说明每个工作流的 prompt 注入内容、LLM 输出的校验归一化逻辑、以及 Handler/Orchestrator 如何将输出落实到 RoughCanvas 画布。

---

## 一、总览：两次 LLM 调用的职责

```
用户指令
   │
   ▼
┌──────────────────────────────────────────────┐
│ 第一层 LLM：task-generate                     │
│   输入：canvasState + recentCommands + 指令   │
│   注入：~160 行 system prompt                 │
│   输出：TaskPlan { tasks[], response }        │
│   tasks 里的 params 可能不完整（坐标/样式可选） │
└──────────────┬───────────────────────────────┘
               │  TaskPlan
               ▼
┌──────────────────────────────────────────────┐
│ Orchestrator（硬编码，不调 LLM）              │
│   toposort → 逐层遍历 → 对每个 task：         │
│     resolveRefs → getHandler → handler()     │
└──────────────┬───────────────────────────────┘
               │  每个 task
               ▼
┌──────────────────────────────────────────────┐
│ Handler（可能调第二层 LLM）                    │
│   CreateHandler  → CreateSubWorkflow（需要时）│
│   ModifyHandler  → ModifySubWorkflow（需要时）│
│   ConnectHandler → ConnectSubWorkflow（需要时）│
│   DeleteHandler  → 纯硬编码                   │
│                                              │
│   Handler 输出：TaskExecutionResult           │
│     outputObject: DrawObject ← 这就是画布对象  │
└──────────────┬───────────────────────────────┘
               │
               ▼
       onObjectsChange(objects)
               │
               ▼
       RoughCanvas.redraw()
         根据 obj.type 调用对应的 Rough.js / Canvas API
```

---

## 二、第一层：task-generate

### 2.1 注入内容

**文件**：`lib/workflow/task-generate.ts`

**System Prompt 结构**（约 160 行）：

```
1. 角色定义 — "你是一个绘图指令规划器"
2. 画布信息 — 动态注入当前 canvasWidth × canvasHeight、对象数量
3. 四种 TaskType 定义 — CREATE / MODIFY / DELETE / CONNECT
   每个类型列出 params 字段、含义、可选/必填
4. targetId 定位规则 — 按 label → 按类型 → 按位置 → 按序数
5. 位置推理规则 — 绝对/相对/默认
6. 依赖关系规则 (DAG) — 5 条规则 + ref 引用语法
7. 输出格式 — 严格 JSON schema + 字段说明
8. 自检清单 — 7 项输出前检查
```

**具体注入的动态数据**：

| 注入点 | 来源 | 示例值 |
|---|---|---|
| `canvasWidth × canvasHeight` | `input.canvasState.meta` | `1200 × 800` |
| `当前对象数` | `input.canvasState.objects.length` | `3` |
| 已有对象摘要 (id, type, x, y, w, h, label, stroke, fill) | `canvasState.objects` 的 JSON 摘要 | `[{ id:"obj_01", type:"rect", x:200, y:100, ... }]` |
| 最近 5 条指令原文 | `input.recentCommands` | `["画一个矩形", "改成红色"]` |
| 当前用户指令 | `input.currentCommand` | `"画登录框和数据库，箭头连接"` |

**不会注入的内容**：
- 不会将完整 canvasState JSON 发给 LLM（做了摘要——只传关键识别字段）
- 不会将 system prompt 之外的内容（如 Rough.js API 细节、前端渲染逻辑）注入

### 2.2 输出校验

```typescript
// 校验流程（task-generate.ts 主函数）

JSON.parse(result.content)
  ↓
validateTasks(rawTasks)  // 对每个 task：
  ├── normalizeTaskType(taskType)      // 别名映射 + 兜底降级为 CREATE
  ├── validateParams(taskType, params) // 按类型校验必填字段
  │   ├── CREATE: shape 校验（4 种合法值），数值取整
  │   ├── MODIFY: targetId 必填，changeHint 与具体字段互斥
  │   ├── DELETE: targetId 必填
  │   └── CONNECT: fromId/toId 必填
  └── dependsOn 过滤（只保留引用存在的 id）
  ↓
detectCircular(tasks)    // DFS 循环依赖检测
  ↓
return { tasks, response }
```

### 2.3 别名归一化

```typescript
const TASK_TYPE_ALIASES = {
  create/add/draw/new/copy/duplicate/insert/place → CREATE
  modify/change/update/set/adjust/resize/style/color/move/shift → MODIFY
  delete/remove/erase → DELETE
  connect/link/join/arrow/line/wire → CONNECT
};
// 不匹配 → 降级为 CREATE
```

---

## 三、第二层：子工作流

### 3.1 CreateSubWorkflow

**文件**：`lib/workflow/sub-workflows/create-sub-workflow.ts`

**调用条件**：`params.visualHint != null || !params.style || params.style 为空`

**注入的 System Prompt**：

```
角色：手绘风格绘图样式设计师
可用的 4 种形状（rect/circle/ellipse/diamond）及其语义
可用的 6 种 fillStyle（solid/hachure/cross-hatch/dots/dashed/zigzag）
颜色规则：柔和协调、避免纯黑白、"醒目"→高饱和度+solid+粗边框...
手绘粗糙度 roughness: 0~2，默认 0.5
输出格式：严格 JSON { shape, style: { fill, stroke, strokeWidth, fillStyle, roughness } }
```

**注入的 User Message**：

```
## 用户描述       ← task.description
## 建议形状       ← params.shape（如果有）
## 对象标签       ← params.label（如果有）
## 特殊视觉需求   ← params.visualHint（如果有）
## 画布已有样式   ← canvasState.objects 的前 5 个对象的 { type, stroke, fill, fillStyle }
```

**输出校验**：

```typescript
parsed = JSON.parse(result.content)
shape  = validateShape(parsed.shape)     // 4 种合法值，否则 → "rect"
fill   = String(style.fill ?? "#f0f0f0")
stroke = String(style.stroke ?? "#1a1a1a")
sw     = Number(style.strokeWidth ?? 2)
fs     = validateFillStyle(style.fillStyle) // 6 种合法值，否则 → "hachure"
rough  = Number(style.roughness ?? 0.5)
```

### 3.2 ModifySubWorkflow

**文件**：`lib/workflow/sub-workflows/modify-sub-workflow.ts`

**调用条件**：`params.changes.changeHint` 存在（与具体属性字段互斥）

**注入的 System Prompt**：

```
角色：绘图修改指令解析器
输出字段：style / dx / dy / x / y / w / h / label（只输出变化字段）
常见意图 few-shot 映射表：
  "更醒目" → { style: { fill: 高饱和度, strokeWidth: 3-4, fillStyle: "solid" } }
  "柔和一点" → { style: { fill: 低饱和度, fillStyle: "hachure", roughness: 1.2 } }
  "再大一点" → { w: 当前×1.3, h: 当前×1.3 }
  "往右挪" → { dx: 40 }
  "改成蓝色" → { style: { fill: "#1971c2" } }
  ...
颜色规则：六位十六进制，数值整数
```

**注入的 User Message**：

```
## 修改意图        ← changeHint（如 "更醒目"）
## 当前对象属性    ← targetObject 完整 JSON（type, x, y, w, h, label, stroke, fill, fillStyle, roughness）
## 用户原始描述    ← task.description
```

### 3.3 ConnectSubWorkflow

**文件**：`lib/workflow/sub-workflows/connect-sub-workflow.ts`

**调用条件**：`params.lineHint` 存在（如 "虚线"、"粗箭头"）

**注入的 System Prompt**：

```
角色：连线样式选择器
可用的 4 种 lineType：arrow（默认）/ line / dashed / arc-arrow
可用的 3 种 arrowType：single（默认）/ double / none
样式规则：默认色 #333333、默认线宽 2
  "粗" → strokeWidth: 3-4
  "红色" → stroke: "#e03131"
```

**注入的 User Message**：

```
## 用户描述    ← task.description
## 连线提示    ← lineHint
## 起始对象    ← fromObject 摘要 JSON
## 终止对象    ← toObject 摘要 JSON
```

---

## 四、编排器：如何把 TaskPlan 变成 DrawObject

### 4.1 拓扑排序

**文件**：`lib/orchestrator/topo-sort.ts`

```typescript
// 输入：TaskPlan.tasks（DAG）
// 输出：ExecutionLayer[]（分层计划）

// 算法：
remaining = [...tasks]
while (remaining.length > 0) {
  ready = remaining.filter(t => t.dependsOn.every(dep => completed.has(dep)))
  layers.push({ tasks: ready })
  ready.forEach(t => { completed.add(t.id); remaining.splice(...) })
}
```

例如 `["画A", "画B", "连线A→B"]`：
- dependsOn: task_0=[], task_1=[], task_2=["task_0", "task_1"]
- Layer 0: [task_0, task_1]（无依赖，同层）
- Layer 1: [task_2]（等 task_0 和 task_1 都完成）

### 4.2 逐层执行

**文件**：`lib/orchestrator/orchestrator.ts`

```
对于每一层、每个任务：
  1. resolveRefs(params, executionResults)
     → 将 "ref:task_0.output.id" 替换为实际对象 id

  2. getHandler(task.taskType)
     → 从 registry 获取对应的 Handler 函数

  3. handler({ llm, task, context })
     → context = { canvasState（本任务执行前的快照）, executionResults, emit }
     → Handler 可能调用子工作流（第二层 LLM）
     → 返回 TaskExecutionResult { status, outputObject, ... }

  4. applyResult(canvasState, result)
     → SUCCESS + outputObject → 追加或替换到 objects 数组
     → SUCCESS + deletedObjectId → 从 objects 数组移除（含级联连线）

  5. emit(TASK_RESULT / TASK_FAILED)
```

**关键**：同层任务**串行执行**，每个任务完成后立即更新 canvasState，下一个任务看到的画布包含前一个任务的输出。这与原始设计的"同层并行"不同，避免了位置冲突。

### 4.3 canvasState 更新

```typescript
function applyResult(state, result) {
  if (result.outputObject) {
    // 同 id 已存在（MODIFY）→ 替换；否则（CREATE/CONNECT）→ 追加
    const idx = objects.findIndex(o => o.id === result.outputObject.id)
    if (idx >= 0) objects[idx] = result.outputObject
    else objects.push(result.outputObject)
  }
  if (result.deletedObjectId) {
    // 移除目标 + 级联移除关联连线（fromId/toId 指向目标的连线）
    objects = objects.filter(o => o.id !== result.deletedObjectId
      && !result.cascadedDeleteIds.includes(o.id))
  }
  return { ...state, objects }
}
```

---

## 五、Handler 如何组装 DrawObject

### 5.1 CreateHandler

**文件**：`lib/handlers/create-handler.ts`

```
输入：task.params = { shape, x?, y?, w?, h?, label, visualHint? }
       context.canvasState（当前画布，含之前任务产出的对象）

步骤：
  1. 判断是否需要子工作流：
     needsLLM = visualHint != null || style 为空
     → 是：调用 CreateSubWorkflow(llm, { description, shape, label, visualHint, canvasState })
     → 否：直接使用 params 中的 style

  2. 合并样式：fillDefaultStyle(subResult.style)
     → 确保 fill/stroke/strokeWidth/fillStyle/roughness 都有值

  3. 确定尺寸：w = params.w ?? 120, h = params.h ?? 80

  4. 确定位置：
     - params 有 x,y → 直接用
     - 否则 → findDefaultPosition(objects, meta, w, h)
       画布空 → 居中偏上
       画布非空 → 最底部对象下方 +40px

  5. 重叠检测：avoidOverlap(x, y, w, h, objects, meta)
     → 最多 10 次向下偏移尝试

  6. 组装 DrawObject：
     {
       id: "obj_<uuid>",
       type: "rect" | "circle" | "ellipse" | "diamond",
       x, y, w, h,
       label: params.label,
       stroke: "#1a1a1a",
       strokeWidth: 2,
       roughness: 0.5,
       fill: "#...", fillStyle: "hachure",
       seed: random(0-100)
     }

  7. 返回 { taskId, status: "SUCCESS", outputObject: obj }
```

**DrawObject 到达画布的路径**：

```
Handler 返回 outputObject
  → Orchestrator.applyResult() 追加到 canvasState.objects
  → 持久化到 canvases 表 (state JSON)
  → SSE/HTTP 返回 → 前端 setObjects(newObjects)
  → RoughCanvas.redraw()
  → for (obj of objects) {
       if (obj.type === "rect") rc.rectangle(obj.x, obj.y, obj.w, obj.h, opts)
       // ... 其他形状分支
     }
```

### 5.2 ModifyHandler

**文件**：`lib/handlers/modify-handler.ts`

```
步骤：
  1. findObjectById(params.targetId, canvasState.objects)
     → 在 objects 数组中定位目标

  2. 判断是否需要子工作流：
     needsLLM = params.changes.changeHint != null
     → 是：调用 ModifySubWorkflow(llm, { changeHint, targetObject, ... })
     → 返回具体的 { style, dx, dy, x, y, w, h, label }

  3. applyChanges(targetObject, resolvedChanges)
     → 深拷贝 targetObject → 逐字段覆盖：
       dx/dy 累加到 x/y
       绝对坐标 x/y 直接替换
       尺寸 w/h 替换
       label 替换
       style 合并（只覆盖 LLM 返回的非 undefined 字段）

  4. clampPosition(updated.x, updated.y, updated.w, updated.h, canvasWidth, canvasHeight)
     → 确保修改后的坐标不超出画布边界

  5. 返回 { taskId, status: "SUCCESS", outputObject: updated }
     → outputObject 的 id 与原 targetObject 相同
     → Orchestrator.applyResult() 通过同 id 替换实现"重绘"
```

### 5.3 DeleteHandler

**文件**：`lib/handlers/delete-handler.ts`（纯硬编码，0 次 LLM 调用）

```
步骤：
  1. findObjectById(params.targetId, objects)
  2. 查找关联连线：objects 中 type ∈ {arrow, arc-arrow, line, dashed}
     且 fromId === targetId 或 toId === targetId
  3. 返回 {
       taskId,
       status: "SUCCESS",
       deletedObjectId: targetId,
       cascadedDeleteIds: [关联连线 id 列表]
     }
```

### 5.4 ConnectHandler

**文件**：`lib/handlers/connect-handler.ts`

```
步骤：
  1. findObjectById(fromId) + findObjectById(toId)

  2. 判断是否需要子工作流：
     needsLLM = params.lineHint != null
     → 是：调用 ConnectSubWorkflow(llm, { lineHint, fromObject, toObject, ... })
     → 返回 { lineType, arrowType, style, label }
     → 否：computeDefaultConnection(from, to, arrowType, label)
       默认：直线箭头，中心点到中心点，颜色 #333333

  3. 计算端点坐标（中心点）：
     fromCx = from.x + from.w/2, fromCy = from.y + from.h/2
     toCx = to.x + to.w/2, toCy = to.y + to.h/2

  4. 组装 DrawObject：
     {
       id: "obj_<uuid>",
       type: "arrow" | "line" | "dashed" | "arc-arrow",
       points: [[fromCx, fromCy], [toCx, toCy]],
       fromId, toId,        ← 用于 DeleteHandler 级联删除
       stroke, strokeWidth,
       roughness: 0.5, seed,
       label, arrowType
     }

  5. 返回 { taskId, status: "SUCCESS", outputObject: lineObj }
```

---

## 六、硬编码 vs LLM 调用总结

| 操作 | 是否调 LLM | 调用哪个 LLM | 决定什么 |
|---|---|---|---|
| 意图分析 + 任务拆解 | ✅ 是 | task-generate（第一层） | TaskType、targetId、依赖关系、ref 引用、位置建议 |
| CREATE 样式选择 | ✅ 是（有 visualHint 时） | CreateSubWorkflow（第二层） | shape 类型、颜色、fillStyle、roughness |
| CREATE 坐标计算 | ❌ 否 | — | findDefaultPosition + avoidOverlap + clampPosition（硬编码） |
| MODIFY 模糊意图解析 | ✅ 是（有 changeHint 时） | ModifySubWorkflow（第二层） | 具体属性变更值（颜色、偏移、尺寸） |
| MODIFY 属性应用 | ❌ 否 | — | applyChanges + clampPosition（硬编码） |
| DELETE | ❌ 否 | — | 纯硬编码（findObjectById + 级联查找） |
| CONNECT 样式选择 | ✅ 是（有 lineHint 时） | ConnectSubWorkflow（第二层） | lineType、arrowType、颜色、线宽 |
| CONNECT 坐标计算 | ❌ 否 | — | 中心点计算（硬编码） |
| 拓扑排序 | ❌ 否 | — | 硬编码图算法 |
| ref 引用解析 | ❌ 否 | — | 正则匹配 + Map 查找（硬编码） |

**关键设计原则**：**LLM 只做语义理解（what / what style），坐标和几何计算全部硬编码。**

这样 LLM 不需要理解 Rough.js 的 API，也不需要精确计算像素级坐标。它只需要说"在 A 的右边画一个醒目的红色矩形"，系统自己算出具体坐标和颜色值。
