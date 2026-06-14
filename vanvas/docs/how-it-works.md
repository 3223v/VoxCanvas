# VoxCanvas 工作原理

一条用户指令如何变成画布上的图形。

---

## 数据流

```
语音/文字 → POST /api/canvas/[id]/command
  → loadSession (DB)
  → task-generate (LLM #1) → TaskPlan { tasks[], response }
  → orchestrator → handlers → DrawObject[]
  → 持久化 → 返回 { response, objects[] }
→ 前端 setObjects() → RoughCanvas 全量重绘
```

## 关键文件

### 入口

| 文件 | 做什么 |
|---|---|
| `app/api/canvas/[id]/command/route.ts` | POST 入口，串联整个 pipeline。**从这里开始读** |

### 第一层 LLM：意图 → 任务 DAG

| 文件 | 做什么 |
|---|---|
| `lib/workflow/task-generate.ts` | 调用 LLM，把"画登录框和数据库，箭头连接"变成 3 个任务的 DAG。**system prompt 是核心** |

### 编排器：执行 DAG

| 文件 | 做什么 |
|---|---|
| `lib/orchestrator/orchestrator.ts` | 拓扑排序 → 逐层串行 → 调用 Handler → 更新 canvasState |
| `lib/orchestrator/topo-sort.ts` | 拓扑排序算法 |

### Handler：任务 → 画布对象

| 文件 | 做什么 |
|---|---|
| `lib/handlers/handler-registry.ts` | taskType → Handler 映射 |
| `lib/handlers/create-handler.ts` | CREATE → DrawObject。调 CreateSubWorkflow（需要时），硬编码计算坐标 |
| `lib/handlers/modify-handler.ts` | MODIFY → 更新后 DrawObject。调 ModifySubWorkflow 解析 changeHint |
| `lib/handlers/delete-handler.ts` | DELETE → 纯硬编码，含级联删除连线 |
| `lib/handlers/connect-handler.ts` | CONNECT → 连线 DrawObject。调 ConnectSubWorkflow（需要时） |
| `lib/handlers/utils.ts` | findObjectById、clampPosition、avoidOverlap、applyChanges、resolveRefs |

### 第二层 LLM：样式细化

| 文件 | 做什么 |
|---|---|
| `lib/workflow/sub-workflows/create-sub-workflow.ts` | 把 visualHint 变成具体的 fill/stroke/fillStyle/roughness |
| `lib/workflow/sub-workflows/modify-sub-workflow.ts` | 把 changeHint（"更醒目"）变成具体属性变更 |
| `lib/workflow/sub-workflows/connect-sub-workflow.ts` | 把 lineHint（"虚线"）变成 lineType/arrowType/style |

### 持久化

| 文件 | 做什么 |
|---|---|
| `lib/persistence/session-loader.ts` | 从 DB 加载 canvasState + recentCommands |
| `lib/persistence/command-repo.ts` | commands 表读写 |
| `lib/persistence/task-repo.ts` | tasks 表读写 |

### 前端

| 文件 | 做什么 |
|---|---|
| `components/canvas/ChatPanel.tsx` | 对话面板：文字/语音输入 → POST 指令 → 展示结果。加载历史 |
| `components/canvas/RoughCanvas.tsx` | 画布核心：指针事件、工具切换、缩放、撤销、redraw() 全量重绘 |
| `components/canvas/PaintPageClient.tsx` | 状态管理：objects、title、canvasId。协调 ChatPanel + RoughCanvas |

### 类型 & LLM

| 文件 | 做什么 |
|---|---|
| `lib/types/draw-object.ts` | DrawObject 定义（全系统共享） |
| `lib/types/task.ts` | TaskNode、4 种 TaskParams、normalizeTaskType |
| `lib/llm/provider.ts` | OpenAI 兼容 LLM 调用（单例、重试、JSON 校验） |

---

## LLM 调用次数

| 场景 | task-generate | 子工作流 | 总计 |
|---|---|---|---|
| "画一个红色矩形" | 1 | 1（有 visualHint） | **2** |
| "把登录框改成蓝色" | 1 | 1（有 changeHint） | **2** |
| "删掉数据库" | 1 | 0（纯硬编码） | **1** |
| "画 A、B、箭头连接" | 1 | 3（A+B 样式 + 连线样式） | **4** |
| "画立方体（3个面）" | 1 | 3（三个面各 1 次样式） | **4** |

---

## 关键设计决策

- **DAG 不是链式**：任务间依赖用 `dependsOn: string[]` 表达，支持多对多依赖
- **同层串行**：避免并行时的位置冲突，2-5 个任务串行差异 < 200ms
- **坐标硬编码**：LLM 不精确计算坐标，系统用 `findDefaultPosition` + `avoidOverlap` 计算
- **`allowOverlap`**：组合式构图（立方体、表格）时跳过 `avoidOverlap`
- **边界宽松**：`clampPosition` 只防完全不可见，允许 80% 溢出
- **文字是手动工具**：AI 可通过 `shape: "text"` 创建文字，但文字编辑（双击）是前端手动功能

## SSE 状态

**当前不支持 SSE 流式推送。** 后端 pipeline 是同步的（POST → 等待全部完成 → 返回 JSON）。前端显示阶段提示（"分析指令…"→"规划任务…"→"绘制中…"）是纯客户端定时器模拟，不反映真实后端进度。详见 `docs/ai.md` §7 的 SSE 协议设计（已设计，未实现）。
