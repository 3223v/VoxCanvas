/**
 * ModifySubWorkflow — 第二层 LLM：将模糊的修改意图解析为具体的属性变更。
 */
import type { ILLMProvider } from "@/lib/llm";
import type { ModifySubWorkflowInput, ModifySubWorkflowOutput } from "@/lib/types";
import { logger } from "@/lib/logger";

function buildSystemPrompt(): string {
  return `你是一个绘图修改指令解析器。

根据用户的模糊修改意图和当前对象的属性，输出具体的属性变更。

## 输出字段说明（只输出需要变更的字段，不要包含不变字段）
- style: 样式变更 { fill, stroke, strokeWidth, fillStyle, roughness }
- dx: 水平偏移（正数向右，负数向左）
- dy: 垂直偏移（正数向下，负数向上）
- x, y: 绝对坐标
- w, h: 新尺寸
- label: 新文字

## 常见意图映射
"更醒目" / "突出" → { style: { fill: 高饱和度暖色, stroke: 深色, strokeWidth: 3-4, fillStyle: "solid" } }
"柔和一点" / "淡雅" → { style: { fill: 低饱和度暖色, stroke: 较浅, fillStyle: "hachure", roughness: 1.2 } }
"再大一点" / "放大" → { w: 当前*1.3, h: 当前*1.3 }
"再小一点" / "缩小" → { w: 当前*0.7, h: 当前*0.7 }
"往右挪" → { dx: 40 }
"往左挪" → { dx: -40 }
"往上挪" → { dy: -40 }
"往下挪" → { dy: 40 }
"改成蓝色" → { style: { fill: "#1971c2" } }
"改成红色" → { style: { fill: "#e03131" } }
"换个风格" → { style: { fillStyle: 随机但合理的选择, roughness: 0.7~1.5 } }

## 规则
- 颜色必须用六位十六进制
- 数值用整数
- 只输出与当前值不同的字段
- 保持视觉协调

## 输出格式
严格 JSON Object，不要任何额外文字：
{
  "style": { "fill": "#e03131", "fillStyle": "solid" },
  "dx": 40
}`;
}

function buildUserMessage(input: ModifySubWorkflowInput): string {
  return [
    `## 修改意图\n${input.changeHint}`,
    `\n## 当前对象属性\n` + JSON.stringify(input.targetObject, null, 1),
    `\n## 用户原始描述\n${input.description}`,
    `\n请输出 JSON。`,
  ].join("\n");
}

export async function modifySubWorkflow(
  llm: ILLMProvider,
  input: ModifySubWorkflowInput
): Promise<ModifySubWorkflowOutput> {
  logger.info("ModifySubWorkflow 开始", {
    changeHint: input.changeHint,
    description: input.description.slice(0, 80),
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
    logger.error("ModifySubWorkflow JSON 解析失败", { content: result.content.slice(0, 100) });
    throw new Error("ModifySubWorkflow 返回了无效 JSON");
  }

  const output: ModifySubWorkflowOutput = {};

  if (parsed.style && typeof parsed.style === "object") {
    output.style = parsed.style as Record<string, unknown>;
  }
  if (typeof parsed.dx === "number") output.dx = Math.round(parsed.dx);
  if (typeof parsed.dy === "number") output.dy = Math.round(parsed.dy);
  if (typeof parsed.x === "number") output.x = Math.round(parsed.x);
  if (typeof parsed.y === "number") output.y = Math.round(parsed.y);
  if (typeof parsed.w === "number") output.w = Math.round(parsed.w);
  if (typeof parsed.h === "number") output.h = Math.round(parsed.h);
  if (typeof parsed.label === "string") output.label = parsed.label;

  logger.info("ModifySubWorkflow 完成", { changedFields: Object.keys(output) });
  return output;
}
