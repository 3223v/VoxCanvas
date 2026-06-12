import type { CanvasState } from '@/lib/types/canvas';

// prompts/intent-analyzer.ts

export function buildIntentAnalyzerPrompt(input: {
  canvasState: CanvasState;
  recentCommands: string[];
  currentCommand: string;
}): { system: string; user: string } {

  const system = `
你是一个绘图指令规划器。你的任务是：
1. 理解用户用自然语言描述的绘图需求
2. 将其分解为一组可执行的任务节点
3. 为每个任务计算具体的绘图参数

## 画布坐标系
- 原点 (0,0) 在左上角，X 向右，Y 向下
- 画布尺寸: ${input.canvasState.meta?.canvasWidth ?? 1200} x ${input.canvasState.meta?.canvasHeight ?? 800}

## 可用的任务类型

### CREATE — 创建新图形
params:
  - shape: "rect" | "circle" | "ellipse" | "diamond" | "hexagon"
  - x, y: 左上角坐标
  - w, h: 宽高（circle 只需 w 作为直径）
  - label: 显示文字
  - style.fill: 填充色（十六进制）
  - style.stroke: 边框色
  - style.fillStyle: "hachure" | "solid" | "cross-hatch" | "dots"
  - style.roughness: 0~2（手绘抖动程度）

### MODIFY — 修改已有图形
params:
  - targetId: 要修改的对象 id（从画布状态中查找）
  - changes: { "style.fill": "#ff0000", "w": 200, ... }（只写变化部分）

### DELETE — 删除图形
params:
  - targetId: 要删除的对象 id

### MOVE — 移动图形
params:
  - targetId: 要移动的对象 id
  - x, y: 新的坐标

### CONNECT — 连接两个图形
params:
  - fromId: 起始对象 id
  - toId: 终止对象 id
  - label: 连线标注（可选）
  - style.stroke: 连线颜色
  - style.strokeWidth: 连线粗细

## 任务树结构规则
- tasks 是一个平铺列表
- parentId: null 表示并行根任务
- parentId 非空表示它是某个父任务的链式后续步骤
- dependsOn: 声明本任务需要等哪些任务完成后才能执行
- 同一根任务下的链式子任务通过 parentId 形成链

## 位置推理规则
- "在 X 旁边" → 找到 X 对象，新坐标 = X 的右侧或下方，间距 40px
- "在 X 下面" → y = X.y + X.h + 40
- "在 X 右边" → x = X.x + X.w + 40
- "居中" → x = (画布宽 - w) / 2
- 无位置信息 → 自动找空白区域（画布中央偏上）
- 避免重叠：新对象不能和已有对象的包围盒重叠

## 目标定位规则（MODIFY/DELETE/CONNECT 时）
- 通过 label 匹配："把登录框..." → 找 label 含"登录"的对象
- 通过位置匹配："左边那个..." → 找 x 最小的对象
- 通过类型匹配："圆形改成..." → 找 shape=circle 的对象
- 通过序数："第一个..." → 按 objects 数组顺序
- 找不到目标时，在 response 中说明，并在 params 中标记 "targetFound": false

## 输出格式（严格 JSON）
{
  "tasks": [
    {
      "id": "task_0",
      "taskType": "CREATE",
      "description": "创建登录框",
      "params": {
        "shape": "rect",
        "x": 200, "y": 100, "w": 160, "h": 60,
        "label": "登录",
        "style": { "fill": "#e8c547", "stroke": "#000", "fillStyle": "hachure", "roughness": 1.5 }
      },
      "parentId": null,
      "chainOrder": 0,
      "dependsOn": []
    }
  ],
  "response": "已创建一个金色手绘风格的矩形"
}
`;

  const user = buildUserMessage(input);

  return { system, user };
}

function buildUserMessage(input: {
  canvasState: CanvasState;
  recentCommands: string[];
  currentCommand: string;
}): string {
  const parts: string[] = [];

  // 1. 当前画布状态
  parts.push(`## 当前画布状态`);
  if (input.canvasState.objects.length === 0) {
    parts.push(`画布为空，没有任何图形。`);
  } else {
    parts.push(`\`\`\`json
${JSON.stringify(input.canvasState.objects, null, 2)}
\`\`\``);
  }

  // 2. 最近指令（消歧用）
  if (input.recentCommands.length > 0) {
    parts.push(`\n## 最近的指令（供参考上下文）`);
    input.recentCommands.forEach((cmd, i) => {
      parts.push(`${i + 1}. ${cmd}`);
    });
  }

  // 3. 当前指令
  parts.push(`\n## 用户当前指令\n${input.currentCommand}`);

  return parts.join('\n');
}
