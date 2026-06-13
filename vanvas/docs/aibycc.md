# AI 绘图系统设计方案审阅与优化建议

---

## 一、总体评价

你的设计文档展现了对问题域的深刻理解：两层 LLM 职责分离、DAG 依赖模型、拓扑排序编排、SSE 流式推送——这些核心理念**方向正确且设计质量很高**。但在与现有系统对接时，存在几处关键性的架构摩擦，如果直接按此方案全量实现，会遇到较大的工程阻力。

以下按问题严重程度从高到低逐一分析，最后给出优化方案和分阶段实施建议。

---

## 二、核心架构问题

### 问题 1：渲染模型与现有 Rough.js 画布的根本性冲突 ⚠️ 严重

**你的设计**：后端 Handler 生成 `RenderOp`（draw / drawLine / redraw / erase），通过 SSE 逐个推送到前端，前端"逐任务实时渲染，动态出图"。

**现有系统的现实**：`RoughCanvas` 是一个**全量重绘**的 Canvas 组件。每次 `objects` 数组发生变化 → `useEffect` 触发 `redraw()` → `ctx.clearRect` 清空整个画布 → 遍历所有 objects 重新调用 Rough.js 绘制。Rough.js 本身也不是 retained-mode 渲染器——它在 Canvas 上即时绘制，没有"中删一个对象"或"局部更新"的概念。

**具体矛盾**：

| 你的设计假设 | 现有系统实际 |
|---|---|
| 服务端分步推送 RenderOp，前端增量渲染 | 前端 state 驱动，objects 数组变更 → 全量重绘 |
| `redraw` = 替换单个对象 | 代码中根本没有单对象替换的路径 |
| `erase` = 从画布移除单个对象 | 只能通过 `onObjectsChange(newObjects)` 更新整个数组 |
| `drawLine` 是独立 RenderOp | 连线（arrow / arc-arrow）就是 objects 数组中的普通元素 |

**结论**：RenderOp 体系在现有画布上无法直接落地。要么改造前端画布为增量渲染，要么放弃服务端 RenderOp 的设计，改为服务端直接操作 objects 数组。

**我的建议**：**保持前端 state-driven 模式，服务端直接产出 objects 数组变更**。不要引入 RenderOp 中间层。Handler 执行完成后不生成 RenderOp，而是直接生成最终的 `DrawObject`（就是现有 `RoughCanvas` 消费的格式），SSE 推送的是"本次任务新增/修改/删除后的完整 objects 数组"或"增量变更（add/update/remove）"。前端拿到后直接 `setObjects()`。

---

### 问题 2：tasks 表的 DAG 依赖字段与现有 schema 不兼容 ⚠️ 严重

**你的设计**：`dependsOn: string[]` — 一个任务可以依赖多个前驱任务（DAG 的边可以是多对多）。

**现有 schema**（`db/db.sql` 表 `tasks`）：

```sql
depends_on_task_id TEXT    -- 单值字段，不是数组
parent_task_id     TEXT    -- 树结构字段
chain_order        INTEGER -- 链式顺序字段
```

现有 schema 设计的是一个**任务树/链**模型（`parent_task_id` + `chain_order`），而不是你设计的 DAG 模型。`depends_on_task_id` 字段名虽然是单数，但如果存 JSON 数组也可以勉强兼容。但 `parent_task_id` 和 `chain_order` 的存在说明原始设计意图是层级树而非 DAG。

另外，`commands` 表里还有字段：
```sql
total_tasks     INTEGER -- 总任务数
completed_tasks INTEGER -- 已完成数
failed_tasks    INTEGER -- 失败数
```

这些字段与你的 DAG 编排模型兼容，但执行层（tasks 表）的结构需要调整。

**我的建议**：
1. **保留 `parent_task_id` 和 `chain_order` 字段**，它们对"一个 task 拆分为多个子步骤"的场景仍然有价值
2. **将 `depends_on_task_id` 改为 `depends_on` TEXT**，存储 JSON 数组 `'["task_0", "task_1"]'`
3. 或者在 tasks 表和自身之间建立多对多关系，但这在 SQLite 中会引入额外复杂度，不推荐

---

### 问题 3：形状类型体系不一致

| 你的设计中的形状 | 现有代码中的 DrawObject.type |
|---|---|
| rect, circle, ellipse, diamond, **hexagon** | line, dashed, arrow, arc-arrow, rect, diamond, circle, ellipse |

差异：
- 你新增了 `hexagon`（现有代码不支持）
- 你把 `line` / `arrow` / `arc-arrow` / `dashed` 归为 CONNECT 的输出（drawLine），现有代码把它们视为一等公民（type 直接就是 "arrow" 这种）
- 你的设计里没有 `arc-arrow`（弧线箭头）

**我的建议**：统一类型体系。要么：
- **方案 A**：所有视觉元素都是 `DrawObject`，`type` 字段覆盖所有形状 + 所有连线类型（保持现有模型，扩展 hexagon）
- **方案 B**：显式区分 `ShapeObject` 和 `LineObject`，但都放在 objects 数组里，前端渲染时 route 到不同绘制逻辑（现有代码实际上已经这样做了——`redraw()` 里的 if/else 就是按 type 分支）

推荐方案 A，改动最小。

---

### 问题 4：文件组织中的 Prisma 引用

你的文档 §10 提到 `prisma/schema.prisma` 和 `prisma/migrations/`。但现有项目使用的是 **Drizzle ORM + better-sqlite3**。这是一个纯粹的工具链不一致。

**建议**：文件组织中去掉 Prisma 引用，统一为 Drizzle + inline SQL migration 模式。

---

## 三、架构设计问题

### 问题 5：第一层的"模糊参数"边界不清晰

你在 §1.3 举例说明 task-generate 输出 `params: { shape: "ellipse", label: "数据库" }`，然后 CreateSubWorkflow 进一步生成"双层椭圆 + 横线纹理"。

**核心矛盾**：task-generate 的 prompt 要求它输出精确的 `x, y, w, h`——但如果它连形状都不确定（比如"画一个数据库图标"→是椭圆还是圆柱体？），它如何输出合理的坐标？它输出的坐标会被 CreateSubWorkflow 改变吗？如果会变，第一层为什么要输出坐标？

**我的建议**：明确定义第一层 params 的**必填**和**可选**字段：

- **CREATE**：第一层必须输出 `shape`（形状类型）和位置建议（可为空，由子工作流计算）。`style` 完全由子工作流负责。
- **MODIFY**：第一层必须输出 `targetId`。`changes` 中如果有 `changeHint` 则不会有具体的 style 字段；反之亦然。**二者互斥**。
- **DELETE**：第一层必须输出 `targetId`，不需要子工作流。
- **CONNECT**：第一层必须输出 `fromId` + `toId`。线型、箭头由子工作流负责。

即：**第一层做"对象识别 + 关系判断"，第二层做"视觉呈现"**。prompt 中明确写出哪些字段由哪层负责。

---

### 问题 6：SSE 在 Next.js App Route 中的可行性

你在 §7 定义了 SSE 协议，§10 规划了 `GET /api/canvas/[id]/sse` 端点。

Next.js App Router 的 Route Handler 运行在 serverless 环境（Edge 或 Node.js）。SSE 需要长连接，这在以下场景会有问题：
- Vercel 免费版有 10 秒函数执行超时
- 某些部署平台不支持 streaming response 的长时间保持
- 开发时 Turbopack 对 SSE 的支持不稳定

**但**：如果你部署在自托管 Node.js 服务器上，这完全不是问题。`better-sqlite3` 本身就绑定了 Node.js 原生模块，说明你的部署目标不是 Vercel Edge，而是 Node.js 服务器。在这种场景下 SSE 完全可行。

**我的建议**：明确部署目标，在文档中注明"需要 Node.js 运行时，不支持 Edge Runtime"。同时为 SSE 连接管理加入心跳机制（每 15 秒发一个 comment 行 `: heartbeat`）。

---

### 问题 7：并行执行时的 canvasState 一致性问题

你的编排器设计（§3.2）中，同一层的并行任务共享同一个 `canvasState`（本层执行前的快照）。对于独立的 CREATE 任务（Layer 0 的 task_0、task_1），它们各自计算位置时看不到对方——因为彼此都未完成。

**举例**：
```
用户: "画一个登录框，旁边画一个数据库"
task_0 (CREATE 登录框) → 位置: 居中
task_1 (CREATE 数据库) → 位置: 也居中（因为看不到 task_0 的输出）
→ 两个矩形重叠
```

子工作流接到的是同一个 canvasState，两个对象会被放到相同位置。

**我的建议**：
1. **简单场景**：所有独立 CREATE 串行执行（Layer 0 只放一个 CREATE），让后续的 CREATE 能看到前面的输出。代价是失去并行性，但对于绝大多数绘图指令（每次创建 2-5 个对象），性能和体验差异微乎其微。
2. **复杂场景**：允许 LLM 在 task-generate 阶段就规划好绝对坐标（task_1 的 x 设为 task_0 的 x + task_0 的 w + 40），这样即使并行也不冲突。这需要第一层 LLM 输出更精确的布局计划。

推荐方案 1 作为默认行为，方案 2 作为优化。对用户体验来说，2 个对象间隔 200ms 依次出现和同时出现的感知差异极小，但正确性至关重要。

---

### 问题 8：缺少 LLM Provider 抽象层

你的设计通篇使用 `callLLM()` / `callLLMWithRetry()`，但没有定义 LLM provider。现有系统只有 `ZHIPU_API_KEY`（用于 ASR），没有 LLM 调用的 API key 或 endpoint。

**我的建议**：在 `lib/llm/` 下建立 provider 抽象：

```typescript
interface LLMProvider {
  chat(params: {
    messages: { role: string; content: string }[];
    responseFormat?: { type: "json_object" };
    temperature?: number;
  }): Promise<{ content: string }>;
}
```

初期实现智谱 GLM-4 或 DeepSeek 的 provider。这样后续切换模型只需换一个 provider 实现。

---

### 问题 9：canvasState 全量传输的成本

task-generate 的输入包含完整的 `canvasState`（所有 objects + meta）。当用户画了 100 个对象后，每次指令都要把 100 个对象的 JSON 发给 LLM。按每个对象 ~200 字符计算，100 个对象 ≈ 20,000 字符 ≈ 5,000 tokens，即每次调用额外消耗约 ¥0.01~0.05（取决于模型）。

**我的建议**：
1. **短期（< 50 对象）**：直接全量传输，简单可靠
2. **中期（50-200 对象）**：引入空间聚类摘要——只传输最近修改的 N 个对象 + 全局统计（对象总数、画布密度、坐标范围）
3. **长期 (> 200 对象)**：引入 RAG 风格的检索——根据用户指令文本，向量检索最相关的画布对象

短期方案在现有阶段完全够用。但需要在 prompt 构建函数中预留 `maxObjects` 参数。

---

### 问题 10：部分失败的 DAG 缺少回滚策略

如果 5 个任务中 2 个失败，画布处于什么状态？

你的设计（§3.7）说"一个任务失败不影响同层其他任务，但会级联影响依赖它的后续任务"。这意味着画布会处于**部分修改状态**。对于绘图应用，这可能不是大问题（"画了登录框但数据库没画成"），但需要明确决策。

**我的建议**：
1. 默认：**无回滚，partial success 保留**。前端收到 ALL_DONE 时展示执行摘要（3 成功 / 2 失败），用户自行决定是否 undo
2. 利用现有的 `snapshot_before` 机制，失败时用户可一键回退
3. SSE 推送 TASK_FAILED 时附原因，让用户看到

---

## 四、次要问题

### 问题 11：Delete 级联删除关联连线

你的 DeleteHandler（§4.2）设计了级联删除关联连线——这很好。但现有 `RoughCanvas` 中连线对象（arrow / arc-arrow）通过 `points` 字段定义坐标，没有 `fromId` / `toId` 语义。要实现级联删除，需要：
- 连线对象增加 `fromId` / `toId` 元数据字段
- 或者在前端 objects 中搜索 `points` 端点坐标与目标对象相交的连线

推荐前者——扩展 DrawObject 接口增加可选的 `fromId` / `toId`。

### 问题 12：`used_llm` 字段应该是 boolean

现有 tasks 表的 `used_llm INTEGER NOT NULL DEFAULT 1`。你的设计用这个字段标记任务是否调用了子工作流 LLM。用 `1` 表示 true 但 SQLite 没有原生 boolean——保持 INTEGER 但改名为 `used_llm INTEGER NOT NULL DEFAULT 0`（0=纯硬编码，1=调用了 LLM），语义更清晰。

### 问题 13：文字渲染

你的设计 §9.3 提到"Rough.js 不支持文字渲染，使用 Canvas 原生 API"——正确。现有代码 `RoughCanvas.tsx` 的 `redraw()` 函数**完全没有文字渲染**。如果你要在 AI 绘图中加入 label 文本，需要先在 RoughCanvas 中实现文字叠加层。这是前置依赖。

---

## 五、优化后的架构方案

基于以上分析，给出优化后的核心数据流：

```
用户语音 → ASR → 文本指令
                      ↓
┌─────────────────────────────────────────────┐
│         POST /api/canvas/[id]/command        │
│                                              │
│  1. task-generate (LLM #1)                  │
│     输入: canvasState 摘要 + 指令 + 历史      │
│     输出: TaskPlan (DAG) + AI 回复文字        │
│     ↓                                        │
│  2. Orchestrator (拓扑排序 → 逐层串行)        │
│     For each task (同层可并行，但推荐串行):    │
│       ↓                                      │
│     2a. 子工作流 (LLM #2, 需要时)            │
│         输入: task 描述 + 上下文              │
│         输出: 完整的 DrawObject 参数          │
│       ↓                                      │
│     2b. Handler 组装最终 DrawObject           │
│       ↓                                      │
│     2c. 追加到 objects 数组                  │
│       ↓                                      │
│     2d. SSE push: { taskId, status,          │
│            drawObject, updatedCanvasState }   │
│     ↓                                        │
│  3. 持久化: commands + tasks 写入 DB         │
│  4. SSE push: ALL_DONE                       │
└─────────────────────────────────────────────┘
                      ↓
            前端 RoughCanvas
            setObjects(updatedCanvasState.objects)
            → 全量重绘
```

**关键变更**：
1. ❌ 去掉 RenderOp 中间层
2. ✅ Handler 直接产出 DrawObject（现有类型）
3. ✅ 同层任务推荐串行（解决 canvasState 一致性问题），简单场景并行
4. ✅ SSE 推送完整的 `updatedCanvasState`，前端直接 `setObjects`
5. ✅ LLM provider 通过抽象接口注入

---

## 六、分阶段实施建议

不要一次性实现整个 ai.md 的蓝图。按以下优先级分 4 个阶段：

### Phase 1：打通最简路径（目标：能画一个矩形）

1. 实现 LLM provider 抽象 + 至少一个 provider（如 GLM-4 / DeepSeek）
2. 实现 `POST /api/canvas/[id]/command` 端点（同步模式，无 SSE）
3. 实现最简 task-generate：只支持 CREATE，输出完整 params
4. 前端 ChatPanel 发送文本 → 等待响应 → 拿到 objects 数组 → setObjects
5. 验证端到端："画一个红色矩形" → 画布上出现红色矩形

**产出**：`lib/llm/`, `lib/workflow/task-generate.ts`, `app/api/canvas/[id]/command/route.ts`

### Phase 2：完善单对象绘制

1. 在 RoughCanvas 中实现文字渲染（Canvas fillText）
2. 统一形状类型体系（添加 hexagon 支持）
3. 完善 task-generate prompt：支持所有 4 种 TaskType
4. 实现 4 个 Handler（DELETE 纯硬编码，其余 3 个各调用 1 次 LLM）
5. 实现拓扑排序 + 编排器（串行模式）
6. 扩展 DrawObject 接口增加 `fromId` / `toId`（为 CONNECT 铺垫）
7. 实现 undo（利用 snapshot_before）

**产出**：`lib/orchestrator/`, `lib/handlers/`

### Phase 3：加入 SSE 流式体验

1. 实现 SSE endpoint + 连接管理器
2. 编排器通过 SSE 推送每个任务的完成状态
3. 前端 `use-sse-listener` Hook
4. ChatPanel 展示任务进度（PLAN_READY → TASK_RESULT → ALL_DONE）
5. 心跳保活机制

**产出**：`lib/sse/`, `hooks/use-sse-listener.ts`

### Phase 4：优化与进阶

1. canvasState 摘要/过滤（减少 token 消耗）
2. 并行执行优化（同层无依赖任务并行）
3. CreateSubWorkflow 高级能力（复杂图形组合、装饰）
4. 连接路由避障（ConnectSubWorkflow 升级）
5. 错误恢复策略细化

---

## 七、Prompt 设计关键要点

基于现有 RoughCanvas 的实际绘制能力，task-generate 的 system prompt 必须明确告知 LLM：

1. **可用的 shape 类型**（与 DrawObject.type 严格一致）：
   - `rect` — 矩形（x, y, w, h）
   - `circle` — 圆形（x, y, w, h，同等宽高）
   - `ellipse` — 椭圆
   - `diamond` — 菱形
   - 后续扩展 `hexagon`

2. **可用的连线类型**：
   - `arrow` — 带箭头直线
   - `arc-arrow` — 弧线箭头
   - `line` — 无箭头直线
   - `dashed` — 虚线

3. **可用的填充样式**（与 fillStyle 严格一致）：
   - `solid` / `hachure` / `cross-hatch` / `dots` / `dashed` / `zigzag`

4. **坐标系**：原点左上角，(0,0)，X 右 Y 下，画布尺寸 {width} × {height}

5. **颜色**：必须输出 `#` 开头的 6 位十六进制

---

## 八、总结

| 维度 | 你的方案 | 问题 | 优化方向 |
|---|---|---|---|
| 整体架构 | 两层 LLM + 编排器 + Handler | ✅ 方向正确 | 保持 |
| 渲染模型 | 服务端 RenderOp 增量推送 | ⚠️ 与 Rough.js 不兼容 | 改为直接产出 DrawObject |
| 数据模型 | DAG 多依赖 | ⚠️ 与现有 schema 冲突 | 调整 tasks 表字段 |
| 并行策略 | 同层并行 | ⚠️ canvasState 一致性问题 | 默认串行，按需并行 |
| 类型体系 | hexagon 等新形状 | ⚠️ 与现有类型不一致 | 对齐现有类型后扩展 |
| 文件组织 | Prisma 引用 | ⚠️ 工具链不一致 | 统一为 Drizzle |
| LLM 调用 | 无 provider 抽象 | ⚠️ 无法切换模型 | 增加 provider 接口 |
| SSE | App Route 长连接 | ⚡ 需确认部署目标 | 注明需要 Node.js 运行时 |
| 实施节奏 | 全量蓝图 | ⚠️ 工程量大 | 分 4 阶段渐进交付 |

**核心结论**：你的两层 LLM + DAG 编排的架构设计质量很高，但需要在**渲染模型对接**和**数据模型对齐**上做关键调整。优化后分阶段实施，第一阶段的端到端可工作原型（"说一句话画一个矩形"）可以在 1-2 天内完成。
