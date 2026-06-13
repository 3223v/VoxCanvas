# AI 绘图系统效果问题深度分析与优化方案

基于一次实际的"绘制立方体"交互日志，逐层诊断问题根因，并给出修复方案。

---

## 一、日志还原：发生了什么

用户三次尝试让 AI 画立方体：

### 第 1 次："绘制一个立方体图像，确保透视和阴影关系"
→ taskCount=0。LLM："抱歉，目前只支持矩形、圆形..."

### 第 2 次："对的，我就是要你用各种图像色彩组合出一个立方体"
→ 再次 taskCount=0。LLM 坚持拒绝。

### 第 3 次："利用现有的图形，组合出一个看起来是立体的图像，不可以吗"
→ taskCount=3，三个矩形：正面(120×120)、顶部(120×40)、侧面(40×120)

**但结果是 3 个散乱的矩形，完全不像立方体。**

### 为什么散乱？

日志关键行：

```
task_0: (440, 440) 120×120  ← 正面
task_1: 意图 y=480          ← 顶部，紧贴正面
  → avoidOverlap shifted: y=600  ⚠️ 被弹开了！
task_2: 意图 y=560          ← 侧面
  → avoidOverlap shifted: y=800  ⚠️ 又被弹开！
```

**根因**：`avoidOverlap` 函数检测到重叠，自动向下偏移。LLM 精心设计的立方体布局（三个面需要精确拼接）被完全破坏。

---

## 二、逐层诊断

### 问题 1：`avoidOverlap` 假设所有重叠都是坏的

```typescript
if (overlapping) y += h + spacing * (attempt + 1);
```

这个假设对独立对象成立，但对"组合式构图"不成立。立方体的三个面需要互相紧贴甚至部分重叠。

### 问题 2：DAG 还是链式？——DAG 本身没错

| 场景 | 依赖关系 | 模型 |
|---|---|---|
| "画 A、B、箭头连接" | task_2 依赖 task_0, task_1 | DAG ✅ |
| "画 A，把 A 改色" | task_1 依赖 task_0 | DAG/链式 ✅ |
| "画立方体三个面" | 无依赖，但需协调放置 | 两者都不够 |

立方体三个面是**并列关系**（画谁先都可以），但需要**协调放置**。DAG 和链式都无法表达"协调但不依赖"。未来可加 Group/Composite 概念，短期用 `allowOverlap` 解决。

**结论**：保留 DAG，增加 `allowOverlap`。

### 问题 3：LLM 不知道它能用什么

task-generate prompt 只列了 4 个 shape 名字。LLM 不知道：
- `rect` 可以放在任意坐标，多个 rect 可以拼出复杂图形
- `line` 可以画任意线段（甚至能画三角形）
- `fillStyle: "solid"` = 实色填充，"hachure" = 手绘阴影
- 没有"立方体"形状，但三个 rect + `allowOverlap` = 立方体

### 问题 4：缺少"组合式绘图"示例

few-shot 覆盖了单对象创建、连线、修改、删除、排列——唯独没教**如何用基础形状组合出复杂图形**。

### 问题 5：子工作流不理解视觉概念

visualHint: "浅蓝色填充，有明暗对比" → 返回 fillStyle: "hachure"（斜线阴影），不是 solid。LLM 没理解"明暗对比 = solid + 不同深浅"。

---

## 三、修复方案

### 修复 A：`allowOverlap`（代码，2 文件）

`lib/types/task.ts` 的 CreateParams：
```typescript
allowOverlap?: boolean;  // 允许与已有对象重叠（用于组合式构图）
```

`lib/handlers/create-handler.ts`：
```typescript
const adjusted = params.allowOverlap
  ? { x, y }
  : avoidOverlap(x, y, w, h, objects, meta);
```

### 修复 B：task-generate prompt 注入形状能力（~40 行 prompt）

```
## 可用的形状及其能力

### rect（矩形）— 最通用的形状
可做：面板、按钮、卡片、立方体的面、表格
通过精确的 x/y/w/h 控制，多个 rect 可拼出复杂图形

### circle / ellipse / diamond
circle: 节点、端点
ellipse: 数据库图标（纵向椭圆）
diamond: 判断/条件分支

### 连线（arrow / line / dashed / arc-arrow）
arrow: 带箭头，表达方向/流程
line: 无箭头，表达无向关系

### 填充样式（fillStyle）
solid: 实色填充 → 适合"面"（面板、立方体面）
hachure: 手绘阴影线 → 默认风格
cross-hatch: 交叉线 → 更密纹理

### 组合（重要！）
用基础形状组合出复杂效果：
- 3 个 rect 拼成立方体（正面+顶面+侧面，allowOverlap=true）
- rect + ellipse + arrow → 登录流程
- 多个 rect 拼表格、时间轴
- circle + line → 节点关系图
```

### 修复 C：组合式绘图 few-shot（~30 行 prompt）

```
### 示例 7：组合式绘图 — 矩形拼立方体
用户: "画立方体"
画布: 空
→ {
  "tasks": [
    { "id": "task_0", "taskType": "CREATE",
      "description": "立方体正面",
      "params": { "shape": "rect", "x": 440, "y": 320, "w": 120, "h": 120,
                  "label": "正面", "allowOverlap": true,
                  "visualHint": "浅蓝色，立方体正面" },
      "dependsOn": [] },
    { "id": "task_1", "taskType": "CREATE",
      "description": "立方体顶面（透视）",
      "params": { "shape": "rect", "x": 440, "y": 280, "w": 120, "h": 40,
                  "label": "顶面", "allowOverlap": true,
                  "visualHint": "白色高光，比正面亮" },
      "dependsOn": [] },
    { "id": "task_2", "taskType": "CREATE",
      "description": "立方体右侧面（阴影）",
      "params": { "shape": "rect", "x": 560, "y": 320, "w": 40, "h": 120,
                  "label": "侧面", "allowOverlap": true,
                  "visualHint": "深蓝阴影，比正面暗" },
      "dependsOn": [] }
  ],
  "response": "用三个矩形拼成立方体。正面正方形，顶面较扁模拟透视，侧面深色表示阴影。"
}
说明：坐标精确计算让三个面紧密拼接。allowOverlap=true 是关键！
```

### 修复 D：CreateSubWorkflow 视觉概念映射（~15 行 prompt）

```
## 视觉概念映射
"亮"/"高光"/"光源" → solid + 浅色(#f8f8f8系) + roughness 0.2
"暗"/"阴影"/"背面" → solid + 深色(#1a1a2e系) + roughness 0.4
"正面"/"前面" → solid + 标准色 + roughness 0.3
"顶面" → solid + 比正面亮
"侧面" → solid + 比正面暗
"立体感" → solid 填充（不是 hachure），通过不同深浅营造空间感
"明暗对比" → 分别处理每个面的亮度
"扁平"/"简约" → hachure 或无填充
```

### 修复 E：user message 注入形状摘要（~8 行 prompt）

在 `buildUserMessage` 中，画布状态后加入：
```
## 可用形状
rect(矩形) / circle(圆形) / ellipse(椭圆) / diamond(菱形)
arrow / line / dashed / arc-arrow（连线）
填充: solid(实色) / hachure(阴影线) / cross-hatch(交叉线) / dots / dashed / zigzag
组合: 3个rect=立方体 | rect+ellipse+arrow=流程图
```

---

## 四、实施清单

| # | 改动 | 类型 | 改文件 |
|---|---|---|---|
| A | `allowOverlap` 字段 + 跳过重叠检测 | 代码 | task.ts + create-handler.ts |
| B | prompt 注入形状能力说明 | prompt | task-generate.ts |
| C | 增加组合式绘图 few-shot | prompt | task-generate.ts |
| D | CreateSubWorkflow 视觉概念映射 | prompt | create-sub-workflow.ts |
| E | user message 注入形状摘要 | prompt | task-generate.ts |
