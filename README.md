# VoxCanvas — 语音 + AI 驱动的手绘风格画布

一个基于 Next.js 16 的轻量级手绘绘图系统，支持语音输入（ASR）和自然语言指令驱动 AI 自动绘图。

## 快速开始

```bash
npm install
cp .env.example .env.local    # 编辑 .env.local 填入 API Key
npm run dev                    # http://localhost:3000
```

## 环境变量（.env.local）

```bash
# 语音识别（智谱 GLM-ASR）
ZHIPU_API_KEY=your-key

# AI 绘图（OpenAI 兼容协议，支持 GLM/DeepSeek/OpenAI 等）
LLM_API_KEY=your-key
LLM_BASE_URL=https://api.deepseek.com    # 或其他兼容端点
LLM_MODEL_NAME=deepseek-chat             # 模型名
```

## 额外提交的设计方案

[设计方案](/设计方案.md)
设计方案.md

<br />

## 设计

简单来讲：第一次LLM将指令解析为多源有向无环图，节点是任务，调度四个执行执行器去真实落实任务，采用硬编码路由+LLM工作流执行的方式，最后汇总结果直接落库。

由于调度器的设计不是异步的，在DAG里面拓扑排序找到一个顺序去做，采用串行推进任务，所以绘图速度比较慢。

采用Rough.js支持绘图，手动添加了箭头，文本等组件，其自由度不高，但是可靠。

## 功能

- **手绘风格绘图** — 基于 Rough.js，支持画笔、直线、箭头、矩形、菱形、圆形、椭圆、文字
- **语音输入** — GLM-ASR 语音转文字（智谱 API）
- **AI 绘图** — 自然语言指令自动生成图形（如 "画一个登录框和数据库，箭头连接"）
- **画布管理** — 保存、重命名、比例切换、SVG 导出、画廊预览
- **对话面板** — 文本/语音输入 + AI 绘图指令 + 历史记录持久化

## 架构概览

```
用户语音 → ASR → 文本指令
                    ↓
┌────────────────────────────────────────────┐
│  POST /api/canvas/[id]/command             │
│  → task-generate (LLM #1)                  │ ← 意图理解 → 任务 DAG
│  → orchestrator (拓扑排序)                  │
│  → handlers (CREATE/MODIFY/DELETE/CONNECT) │
│  → sub-workflows (LLM #2, 需要时)           │ ← 样式细化
│  → DrawObject[]                            │
└────────────────────────────────────────────┘
                    ↓
          RoughCanvas 渲染
```

<br />

## 技术栈

| 层   | 技术                                    |
| --- | ------------------------------------- |
| 框架  | Next.js 16 (App Router, Turbopack)    |
| UI  | React 19, Tailwind CSS 4              |
| 绘图  | Rough.js (手绘风格) + Canvas 2D (文字)      |
| 数据库 | SQLite (better-sqlite3) + Drizzle ORM |
| ASR | 智谱 GLM-ASR-2512                       |
| LLM | OpenAI 兼容协议（DeepSeek / GLM / OpenAI）  |

## 文档

| 文档                              | 说明             |
| ------------------------------- | -------------- |
| vanvas/docs/workflow-details.md | 提示词注入 + 执行机制详解 |
| vanvas/docs/shapes.md           | 各形状的渲染实现方式     |
| vanvas/docs/how-it-works.md     | 系统工作原理详解       |

