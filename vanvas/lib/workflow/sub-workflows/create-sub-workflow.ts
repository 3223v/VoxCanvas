/**
 * CreateSubWorkflow — 第二层 LLM：将创建任务的模糊描述细化为精确的视觉样式。
 *
 * 不负责坐标计算（坐标由 Handler 硬编码计算），
 * 只负责决定：形状选择、颜色方案、填充样式、粗糙度。
 */
import type { ILLMProvider } from "@/lib/llm";
import type { CreateSubWorkflowInput, CreateSubWorkflowOutput } from "@/lib/types";
import { logger } from "@/lib/logger";

// ── System Prompt ──────────────────────────────────────────

function buildSystemPrompt(): string {
  return `你是一个手绘风格绘图样式设计师。

根据用户的描述和画布上下文，为要创建的对象选择合适的样式。

## 可用形状
- "rect": 矩形（色块、面板、立方体的面。用 x/y/w/h + fill）
- "circle": 圆形（节点）。用 x/y/w/h，w=h
- "ellipse": 椭圆（数据库、花瓣）
- "diamond": 菱形（判断节点）
- "line": 直线（万能画笔，用 points 定义端点。粗细 3-4px 更醒目）
- "dashed": 虚线（辅助线、透视线、草稿。用 points 定义）
- "arrow": 带箭头线（方向、流程。箭头自动在终点）
- "arc-arrow": 弧线箭头（弯曲流程）
- "text": 文字（用 label=内容，x/y 定位）

## 可用填充样式（fillStyle）
- "solid": 实色填充（适合强调、醒目对象）
- "hachure": 斜线阴影（手绘感最强，默认推荐）
- "cross-hatch": 交叉阴影（适合复杂对象）
- "dots": 散点（柔和、装饰性）
- "dashed": 虚线填充
- "zigzag": 锯齿

## 颜色规则

放手发挥吧！这里的规则是指引，不是限制。

- 描边: 深色 ("#1a1a1a", "#2c3e50")，描边要有存在感
- 填充: 避开纯黑白即可，其余任意
- line 类型: 描边要醒目 (粗 3-4px)，颜色有辨识度。星形用金色 "#e6a817"，网格用灰色 "#888"
- "醒目" → 高饱和度 + solid + strokeWidth 3-4
- "柔和" → 低饱和度 + hachure
- "金色"/"黄色" → "#e6a817" 或 "#f0c040"
- "银色"/"灰色" → "#999" 或 "#bbb"
- 多对象时: 相邻对象用协调色系，不同类型用不同色区分

## 形状选择
- "数据库"/"存储" → ellipse
- "判断"/"条件" → diamond
- "开始"/"结束" → circle
- "星形"/"多边形" → line（逐段连接）
- 一般步骤 → rect
- 没有明显语义 → 选你觉得最合适的！

## 视觉概念映射（重要！）

根据 visualHint 中的描述选择 fillStyle 和颜色：

### 光照/亮度
- "亮"/"高光"/"光源"/"明亮" → fillStyle:"solid", fill:浅色(如#f0f4f8或白色系), roughness:0.2
- "暗"/"阴影"/"背面"/"暗面" → fillStyle:"solid", fill:深色(如#1a1a2e或#2c3e50), roughness:0.4
- "正面"/"前面" → fillStyle:"solid", fill:标准中间色, roughness:0.3
- "顶面"/"上面" → fillStyle:"solid", fill:比正面更亮
- "侧面"/"右面" → fillStyle:"solid", fill:比正面更暗（模拟光照衰减）

### 立体感
- "立体" / "立方体" / "3D" → fillStyle:"solid"（不是hachure！）
  通过不同深浅的颜色营造空间感，不是通过纹理
- "明暗对比" → 分别处理：亮面用浅色solid，暗面用深色solid

### 风格
- "扁平"/"简约"/"简洁" → hachure 或 无填充，roughness:0.8
- "手绘"/"草图" → hachure, roughness:1.2
- "正式"/"专业" → solid, roughness:0.3, 柔和色系

### 颜色语义
- "蓝色" → fill:#4a90d9 或 #a8d8ff(浅蓝)
- "红色" → fill:#e03131 或 #ff6b6b(浅红)
- "绿色" → fill:#2f9e44 或 #b7e4c7(浅绿)
- "深蓝"/"海军蓝" → fill:#1a3a5c 或 #2c3e50
- "白色" → fill:#f8f8f8 或 #ffffff

## 输出格式
严格输出 JSON Object，不要任何额外文字：

{
  "shape": "rect",
  "style": {
    "fill": "#...",
    "stroke": "#1a1a1a",
    "strokeWidth": 2,
    "fillStyle": "hachure",
    "roughness": 0.5
  }
}`;
}

// ── User Message ───────────────────────────────────────────

function buildUserMessage(input: CreateSubWorkflowInput): string {
  const parts: string[] = [];

  parts.push(`## 用户描述\n${input.description}`);

  if (input.shape) {
    parts.push(`\n## 建议形状\n${input.shape}`);
  }

  if (input.label) {
    parts.push(`\n## 对象标签\n${input.label}`);
  }

  if (input.visualHint) {
    parts.push(`\n## 特殊视觉需求\n${input.visualHint}`);
  }

  // 画布上已有对象的样式（用于风格一致性）
  const existingStyles = input.canvasState.objects
    .filter((o) => o.stroke || o.fill)
    .slice(0, 5)
    .map((o) => ({
      type: o.type,
      stroke: o.stroke,
      fill: o.fill,
      fillStyle: o.fillStyle,
    }));

  if (existingStyles.length > 0) {
    parts.push(
      `\n## 画布已有样式（参考，保持风格一致）\n` +
      JSON.stringify(existingStyles, null, 1)
    );
  }

  parts.push(`\n请输出 JSON。`);

  return parts.join("\n");
}

// ── 主函数 ─────────────────────────────────────────────────

export async function createSubWorkflow(
  llm: ILLMProvider,
  input: CreateSubWorkflowInput
): Promise<CreateSubWorkflowOutput> {
  logger.info("CreateSubWorkflow 开始", {
    description: input.description.slice(0, 80),
    shape: input.shape,
    visualHint: input.visualHint,
  });

  const result = await llm.chat({
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserMessage(input) },
    ],
    responseFormat: { type: "json_object" },
    temperature: 0.1,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    logger.error("CreateSubWorkflow JSON 解析失败", { content: result.content.slice(0, 100) });
    throw new Error("CreateSubWorkflow 返回了无效 JSON");
  }

  const style = (parsed.style ?? {}) as Record<string, unknown>;

  // 校验 + 默认值
  const output: CreateSubWorkflowOutput = {
    shape: validateShape(parsed.shape),
    style: {
      fill: String(style.fill ?? "#f0f0f0"),
      stroke: String(style.stroke ?? "#1a1a1a"),
      strokeWidth: Number(style.strokeWidth ?? 2),
      fillStyle: validateFillStyle(style.fillStyle),
      roughness: Number(style.roughness ?? 0.5),
    },
  };

  logger.info("CreateSubWorkflow 完成", { shape: output.shape, fillStyle: output.style.fillStyle });
  return output;
}

function validateShape(shape: unknown): CreateSubWorkflowOutput["shape"] {
  const valid = ["rect", "circle", "ellipse", "diamond", "line", "dashed", "arrow", "arc-arrow", "text"];
  if (typeof shape === "string" && valid.includes(shape)) {
    return shape as CreateSubWorkflowOutput["shape"];
  }
  return "rect";
}

function validateFillStyle(fs: unknown): import("@/lib/types").FillStyle {
  const valid = ["solid", "hachure", "cross-hatch", "dots", "dashed", "zigzag"];
  if (typeof fs === "string" && valid.includes(fs)) {
    return fs as import("@/lib/types").FillStyle;
  }
  return "hachure";
}
