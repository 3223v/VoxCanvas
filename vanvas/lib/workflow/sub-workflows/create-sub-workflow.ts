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
- "rect": 矩形（流程步骤、输入框、实体）
- "circle": 圆形（节点、状态）
- "ellipse": 椭圆（数据库、存储、文件）
- "diamond": 菱形（判断、条件分支）

## 可用填充样式（fillStyle）
- "solid": 实色填充（适合强调、醒目对象）
- "hachure": 斜线阴影（手绘感最强，默认推荐）
- "cross-hatch": 交叉阴影（适合复杂对象）
- "dots": 散点（柔和、装饰性）
- "dashed": 虚线填充
- "zigzag": 锯齿

## 颜色规则
- 使用柔和、协调的颜色，避免纯黑(#000000)纯白(#ffffff)
- 描边(stroke)建议用深色，如 "#1a1a1a" 或 "#333333"
- 填充(fill)建议用低饱和度的暖色或冷色
- "醒目"/"强调"/"突出" → 高饱和度填充 + "solid" fillStyle + 较粗 strokeWidth(3-4)
- "柔和"/"淡雅"/"朴素" → 低饱和度 + "hachure" fillStyle
- "数据库"/"存储" → 用 "ellipse" 形状
- "判断"/"条件"/"if" → 用 "diamond" 形状
- "开始"/"结束" → 用 "circle" 或圆角感
- 普通实体/步骤 → 用 "rect"

## 手绘粗糙度
- roughness: 0~2，默认 0.5
- 越接近 0 越精确，越接近 2 越潦草
- 大多数情况用 0.5~1.0

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
  const valid = ["rect", "circle", "ellipse", "diamond"];
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
