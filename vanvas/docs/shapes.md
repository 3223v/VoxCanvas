# VoxCanvas 形状渲染实现说明

本文档说明画布上每种图形类型的渲染实现方式、使用的 API、以及 AI 工作流如何利用这些形状。

---

## 一、总览

| 形状 type | 实现方式 | 使用的 API | AI 可用 |
|---|---|---|---|
| `line` | 自定义（多段折线） | `rc.line()` 逐段 | 是（CONNECT 输出） |
| `dashed` | 自定义（虚线算法） | `rc.line()` + 手动 dash/gap | 是（CONNECT 输出） |
| `arrow` | 自定义（直线 + 箭头） | `rc.line()` + 三角箭头计算 | 是（CONNECT 输出） |
| `arc-arrow` | 自定义（贝塞尔 + 箭头） | `rc.line()` 逐段 + 箭头 | 是（CONNECT 输出） |
| `rect` | Rough.js API | `rc.rectangle()` | 是（CREATE 输出） |
| `diamond` | Rough.js API | `rc.polygon()` | 是（CREATE 输出） |
| `circle` | Rough.js API | `rc.circle()` | 是（CREATE 输出） |
| `ellipse` | Rough.js API | `rc.ellipse()` | 是（CREATE 输出） |
| `text` | Canvas 原生 API | `ctx.fillText()` | 否（手动工具） |

**关键结论**：
- 4 种几何形状（rect/diamond/circle/ellipse）直接调用 Rough.js 内置 API，不涉及自定义几何计算
- 4 种连线类型（line/dashed/arrow/arc-arrow）使用 Rough.js 的 `rc.line()` 为基础，但箭头、虚线、弧线等效果是**系统自己实现的几何计算**
- `text` 不使用 Rough.js（该库不支持文字），使用 Canvas 原生 `fillText` API

---

## 二、各形状详细实现

### 2.1 rect（矩形）

```typescript
// RoughCanvas.tsx — redraw()
rc.rectangle(obj.x!, obj.y!, obj.w!, obj.h!, opts);
```

- **API**：`rc.rectangle(x, y, width, height, options)`
- **输入**：`{ x, y, w, h }` 包围盒
- **Rough.js 做的事**：生成手绘风格的矩形路径，自动添加随机抖动
- **系统不需要做**：任何几何计算
- **AI 工作流使用**：CREATE task → CreateHandler 设置 `x, y, w, h` → `type: "rect"`

### 2.2 diamond（菱形）

```typescript
// RoughCanvas.tsx — redraw()
const cx = obj.x! + obj.w!/2, cy = obj.y! + obj.h!/2;
rc.polygon([
  [cx, obj.y!],           // 上顶点
  [obj.x!+obj.w!, cy],    // 右顶点
  [cx, obj.y!+obj.h!],    // 下顶点
  [obj.x!, cy],           // 左顶点
], opts);
```

- **API**：`rc.polygon(points, options)` — Rough.js 通用多边形
- **输入**：`{ x, y, w, h }` 包围盒
- **系统做的事**：将包围盒的 4 条边中点连接为菱形顶点。这是简单的几何换算（中点公式），不是 Rough.js 内置的菱形
- **AI 工作流使用**：CREATE task → type: "diamond"

### 2.3 circle（圆形）

```typescript
const size = Math.max(obj.w || 0, obj.h || 0);
rc.circle(obj.x!+size/2, obj.y!+size/2, size, opts);
```

- **API**：`rc.circle(centerX, centerY, diameter, options)`
- **输入**：`{ x, y, w, h }` 包围盒
- **系统做的事**：取 w 和 h 的最大值作为直径，圆心在包围盒中心
- **Rough.js 做的事**：生成手绘圆形路径
- **AI 工作流使用**：CREATE task → type: "circle"

### 2.4 ellipse（椭圆）

```typescript
rc.ellipse(obj.x!+obj.w!/2, obj.y!+obj.h!/2, obj.w!, obj.h!, opts);
```

- **API**：`rc.ellipse(centerX, centerY, width, height, options)`
- **输入**：`{ x, y, w, h }` 包围盒
- **Rough.js 做的事**：生成手绘椭圆路径
- **AI 工作流使用**：CREATE task → type: "ellipse"

### 2.5 line（自由线条 / 折线）

```typescript
for (let i = 1; i < obj.points.length; i++)
  rc.line(obj.points[i-1][0], obj.points[i-1][1], obj.points[i][0], obj.points[i][1], opts);
```

- **API**：`rc.line(x1, y1, x2, y2, options)` — 逐段绘制
- **输入**：`{ points: [[x1,y1], [x2,y2], ...] }` 点序列
- **系统做的事**：遍历点序列，相邻两点间画一条 Rough.js 线段
- **AI 工作流使用**：
  - 用户手绘（freehand pen tool）时自动产生
  - CONNECT task → 由 ConnectHandler 计算两端中心点，生成 `points: [[cx1,cy1], [cx2,cy2]]`

### 2.6 dashed（虚线）

```typescript
const [p0, p1] = obj.points;
const len = Math.hypot(p1[0]-p0[0], p1[1]-p0[1]);
const dash = 8, gap = 6, step = dash + gap;
const segments = Math.floor(len / step);
const ux = (p1[0]-p0[0]) / len, uy = (p1[1]-p0[1]) / len;
for (let i = 0; i < segments; i++) {
  const s0 = i * step, s1 = s0 + dash;
  rc.line(p0[0]+ux*s0, p0[1]+uy*s0, p0[0]+ux*s1, p0[1]+uy*s1, opts);
}
// 尾部剩余部分
const remainder = len - segments * step;
if (remainder > 1)
  rc.line(p0[0]+ux*segments*step, p0[1]+uy*segments*step, p1[0], p1[1], opts);
```

- **API**：`rc.line()` — 每个 dash 段单独画一条线
- **系统做的事**：
  1. 计算线段总长度和单位方向向量 `(ux, uy)`
  2. 按 `dash=8, gap=6` 的步长将整条线段切分为 N 个 dash 段
  3. 每个 dash 段画一条 Rough.js 线段
  4. 尾部不足一个步长的部分也画出来
- **Rough.js 不提供原生的虚线**，整个虚线算法是系统自己实现的

### 2.7 arrow（带箭头直线）

```typescript
// 主体线段
rc.line(p0[0], p0[1], p1[0], p1[1], opts);

// 箭头（两条短线构成 V 形）
const angle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
const hl = Math.max(10, sw * 6), ha = Math.PI / 7;
rc.line(p1[0], p1[1],
  p1[0] - hl * Math.cos(angle - ha),
  p1[1] - hl * Math.sin(angle - ha), opts);
rc.line(p1[0], p1[1],
  p1[0] - hl * Math.cos(angle + ha),
  p1[1] - hl * Math.sin(angle + ha), opts);
```

- **API**：`rc.line()` — 1 条主线 + 2 条箭头线
- **系统做的事**：
  1. 画主干线段 `p0 → p1`
  2. 计算线段方向角 `angle`
  3. 箭头长度 `hl = max(10, strokeWidth × 6)`，展开角 `ha = π/7 ≈ 25.7°`
  4. 从 p1 沿 `angle ± ha` 方向反向画两条短线段构成 V 形箭头
- **Rough.js 不提供箭头**，箭头是完全自定义的几何计算

### 2.8 arc-arrow（弧线箭头）

```typescript
// 贝塞尔控制点：垂直于线段中点，偏移 25%
const mx = (p0[0]+p1[0])/2, my = (p0[1]+p1[1])/2;
const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
const dist = Math.hypot(dx, dy);
const offset = dist * 0.25;
const cpx = mx - dy / dist * offset;
const cpy = my + dx / dist * offset;

// 20 段折线逼近二次贝塞尔曲线
const curvePts: [number,number][] = [];
const steps = 20;
for (let t = 0; t <= steps; t++) {
  const tt = t / steps;
  const x = (1-tt)*(1-tt)*p0[0] + 2*(1-tt)*tt*cpx + tt*tt*p1[0];
  const y = (1-tt)*(1-tt)*p0[1] + 2*(1-tt)*tt*cpy + tt*tt*p1[1];
  curvePts.push([x, y]);
}
// 逐段画线
for (let i = 1; i < curvePts.length; i++)
  rc.line(curvePts[i-1][0], curvePts[i-1][1], curvePts[i][0], curvePts[i][1], opts);

// 箭头（与 arrow 相同逻辑，方向取曲线末端切线）
const prev = curvePts[curvePts.length - 2];
const angle = Math.atan2(p1[1]-prev[1], p1[0]-prev[0]);
rc.line(p1[0], p1[1], p1[0]-hl*Math.cos(angle-ha), p1[1]-hl*Math.sin(angle-ha), opts);
rc.line(p1[0], p1[1], p1[0]-hl*Math.cos(angle+ha), p1[1]-hl*Math.sin(angle+ha), opts);
```

- **API**：`rc.line()` — 20 段折线 + 2 条箭头线
- **系统做的事**：
  1. 计算控制点：在 p0-p1 线段中点的垂直方向上偏移 25% 线段长度
  2. 二次贝塞尔公式 `B(t) = (1-t)²P0 + 2(1-t)tC + t²P1` 生成 20 个采样点
  3. 逐段画 Rough.js 线段模拟曲线
  4. 箭头方向取曲线末端切线方向（最后两个采样点的连线方向）
- **Rough.js 不提供曲线或弧线**，贝塞尔曲线折线逼近 + 箭头都是自定义实现

---

## 三、文字渲染

### 3.1 实现方式

```typescript
// RoughCanvas.tsx — redraw()
if (obj.type === "text" && obj.label) {
  ctx.font = `${obj.fontSize ?? 16}px sans-serif`;
  ctx.fillStyle = obj.stroke ?? "#1a1a1a";
  ctx.textAlign = (obj.textAlign as CanvasTextAlign) ?? "left";
  ctx.textBaseline = "top";
  ctx.fillText(obj.label, obj.x ?? 0, obj.y ?? 0);
}
```

- **API**：Canvas 原生 `ctx.fillText()`（**不是** Rough.js API）
- **Rough.js 不支持文字渲染**，文字完全使用 Canvas 2D 原生 API
- 文字没有手绘效果——如果要手绘文字效果，需要额外的路径化处理（不在当前范围内）

### 3.2 文字对象字段

```typescript
{
  type: "text",
  x: number, y: number,       // 左上角坐标
  label: string,               // 文字内容
  fontSize?: number,           // 字号，默认 16
  stroke?: string,             // 文字颜色，默认 "#1a1a1a"
  textAlign?: "left" | "center" | "right",  // 对齐方式，默认 "left"
}
```

---

## 四、AI 工作流与形状的关系

### 4.1 工作流不调用通用绘图 API

AI 工作流（task-generate + sub-workflows + handlers）**不直接调用任何绘图 API**。它的工作方式是：

```
LLM 决策 → Handler 组装 → DrawObject { type, x, y, w, h, style... }
                                    ↓
                          存入 objects 数组
                                    ↓
                          RoughCanvas.redraw() 遍历 objects
                                    ↓
                          根据 type 调用对应的 Rough.js / Canvas API
```

即：**工作流只负责"选择形状类型 + 设置参数"，实际渲染由已有的 RoughCanvas 完成**。

### 4.2 CREATE 可用的形状

CREATE task 的子工作流（`CreateSubWorkflow`）只会输出以下 4 种形状：

- `rect` — 矩形（默认，适合流程步骤、实体）
- `circle` — 圆形（适合节点、状态、开始/结束）
- `ellipse` — 椭圆（适合数据库、存储、文件）
- `diamond` — 菱形（适合判断、条件分支）

### 4.3 CONNECT 可用的连线

CONNECT task 的 Handler 输出以下 4 种连线：

- `arrow` — 带箭头直线（默认，适合方向/流程）
- `line` — 无箭头直线（适合无向关系）
- `dashed` — 虚线（适合弱关系/可选路径）
- `arc-arrow` — 弧线箭头（适合弯曲流程）

### 4.4 如何添加新形状供 AI 使用

如果要让 AI 能画出新形状（如 hexagon、star），需要修改三个地方：

1. **`lib/types/draw-object.ts`** — 在 `DrawObjectType` 中加入新 type
2. **`components/canvas/RoughCanvas.tsx`** — 在 `redraw()` 中加入新 type 的渲染分支
3. **`lib/workflow/sub-workflows/create-sub-workflow.ts`** — 在 system prompt 中告知 LLM 新形状可用

文字对象（`text`）不通过 AI 工作流创建——它是用户手动工具。

---

## 五、样式选项

所有形状共享以下样式字段（Rough.js options）：

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `stroke` | string | `"#1a1a1a"` | 描边颜色（十六进制） |
| `strokeWidth` | number | `2` | 描边粗细 |
| `roughness` | number | `0.5` | 手绘粗糙度（0=精确, 2=潦草） |
| `seed` | number | 随机 | 随机种子（同 seed 产生相同抖动） |
| `fill` | string | — | 填充颜色 |
| `fillStyle` | FillStyle | — | 填充样式：`solid` / `hachure` / `cross-hatch` / `dots` / `dashed` / `zigzag` |

填充样式由 Rough.js 原生支持，不是系统自己实现的。
