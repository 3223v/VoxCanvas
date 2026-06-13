/**
 * ConnectSubWorkflow — 第二层 LLM：处理连线样式选择。
 */
import type { ILLMProvider } from "@/lib/llm";
import type { ConnectSubWorkflowInput, ConnectSubWorkflowOutput } from "@/lib/types";
import { logger } from "@/lib/logger";

function buildSystemPrompt(): string {
  return `你是一个连线样式选择器。

根据用户的描述和两端对象的属性，选择合适的连线样式。

## 可用连线类型（lineType）
- "arrow": 带箭头直线（默认，适合表示方向/流程）
- "line": 无箭头直线（适合表示无向关系）
- "dashed": 虚线（适合表示弱关系/可选路径）
- "arc-arrow": 弧线箭头（适合表示弯曲的流程）

## 箭头类型（arrowType）
- "single": 单向箭头（默认）
- "double": 双向箭头
- "none": 无箭头

## 样式规则
- 默认颜色: "#333333"
- 默认线宽: 2
- "粗" / "粗线" → strokeWidth: 3-4
- "细" / "细线" → strokeWidth: 1
- "红色" / "红色箭头" → stroke: "#e03131"
- "蓝色" → stroke: "#1971c2"

## 输出格式
严格 JSON Object，不要任何额外文字：
{
  "lineType": "arrow",
  "arrowType": "single",
  "style": { "stroke": "#333333", "strokeWidth": 2 },
  "label": ""
}`;
}

function buildUserMessage(input: ConnectSubWorkflowInput): string {
  return [
    `## 用户描述\n${input.description}`,
    `\n## 连线提示\n${input.lineHint}`,
    `\n## 起始对象\n` + JSON.stringify(input.fromObject, null, 1),
    `\n## 终止对象\n` + JSON.stringify(input.toObject, null, 1),
    `\n请输出 JSON。`,
  ].join("\n");
}

export async function connectSubWorkflow(
  llm: ILLMProvider,
  input: ConnectSubWorkflowInput
): Promise<ConnectSubWorkflowOutput> {
  logger.info("ConnectSubWorkflow 开始", {
    lineHint: input.lineHint,
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
    logger.error("ConnectSubWorkflow JSON 解析失败", { content: result.content.slice(0, 100) });
    throw new Error("ConnectSubWorkflow 返回了无效 JSON");
  }

  const validLineTypes = ["arrow", "line", "dashed", "arc-arrow"] as const;
  const validArrowTypes = ["single", "double", "none"] as const;

  const style = (parsed.style ?? {}) as Record<string, unknown>;

  const output: ConnectSubWorkflowOutput = {
    lineType: validLineTypes.includes(parsed.lineType as never)
      ? (parsed.lineType as ConnectSubWorkflowOutput["lineType"])
      : "arrow",
    arrowType: validArrowTypes.includes(parsed.arrowType as never)
      ? (parsed.arrowType as ConnectSubWorkflowOutput["arrowType"])
      : "single",
    style: {
      stroke: String(style.stroke ?? "#333333"),
      strokeWidth: Number(style.strokeWidth ?? 2),
    },
  };
  if (typeof parsed.label === "string" && parsed.label) {
    output.label = parsed.label;
  }

  logger.info("ConnectSubWorkflow 完成", { lineType: output.lineType });
  return output;
}
