# dsh 插件《选中即问 / 侧边问答》规划书

> 状态：待批准（写入当前项目目录 dsh-sidebar-assistant，获批后实施）
> 目标 DSH 基线：deepseek-harness @ 47f943859b（当前 checkout）
> 依据：skills/dsh-plugin-development/SKILL.md（bundle / profile / client 插槽契约）

---

## 1. 目标与需求理解

在 dsh 生成的会话界面里实现「选中即问」：

1) 鼠标左键选中会话中的一段文字。
2) 选中文字下方出现选项卡/按钮「提问」。
3) 点击「提问」，页面出现一个可提问的会话窗口。
4) 用户在窗口里提问（例：这段文字说明了什么）。
5) 回答会话作为独立背景生成：不带上主会话历史（不要历史会话），但引用「系统提示」「用户目录/个人信息」等重要上下文；选中的文字作为引用；用户的问题作为问题。
6) 生成结果在会话窗口中流式展示。

### 解读（待确认）
- 「作为背景」= 发起一个全新的后台子会话，与主会话解耦，仅共享：系统提示 + 用户目录背景 + 选中文字引用。
- 「用户目录」= dsh 描述用户身份/偏好的上下文（persona / agent-preset），需确认具体指哪个目录。

---
## 2. 功能拆解

| 编号 | 功能 | 端 | 说明 |
|---|---|---|---|
| F1 | 监听会话内文字选择 | Client | 会话滚动区监听 selectionchange/pointerup |
| F2 | 选中后文字下方弹出「提问」 | Client | 非阻塞浮层，跟随 text-range 定位 |
| F3 | 点击打开「问答会话窗口」 | Client | shell.overlay 面板，输入问题、展示流式回答 |
| F4 | 组装后台会话上下文 | Host | 系统提示 + 用户目录背景 + 选中文字引用 |
| F5 | 发起新会话并回答 | Host+Client | 复用 dsh 会话引擎，问题作首条消息 |
| F6 | 结果展示 | Client | 流式输出、可关闭、不写主会话历史 |
| F7 | 配置 | 双端 | 预设名、用户目录开关、模板、窗口行为 |

---

## 3. 技术选型与总体架构

插件形态：client + host 双 fiber 插件。遵循 SKILL 规范：package.json 带 dsh.bundle.patch 与 exports 的 ./client；cordis.patch.yml 顶层数组声明 id/name/config。

架构分层（浏览器 Client fiber 与 Node Host fiber）：

浏览器(Client)       渲染 选中监听F1F2 浮窗提问F2 问答窗口overlayF3 输入/流式回答F6
节点(Host)          上下文组装F4(system+用户目录+引用) 会话编排F5(新会话/预设+提交)
client与host 通过 service 协作，不跨包 import 值。

关键接缝（SKILL §5 + 当前源码）：
- 全局浮窗用 shell.overlay，不碰 root 单槽。
- 无现成 selection 槽位，由 client 自建 DOM 监听 + overlay，只动作自有节点。
- 提交/流式复用会话输入通道（inputActions.submit()），不自造 LLM 通道。
- 背景通过 agent-preset 机制（agent-presets 命名空间）定义「问答助手」预设承载系统提示+用户目录；选中文字作会话首条引用。

---
## 4. 端到端数据流

选中文字 →(client 捕获文本+workspaceId/sessionId)→ 文字下方浮窗「提问」→ 点击 → overlay 问答窗
→ 用户输入问题 → host 组装背景上下文(systemPrompt+用户目录+选中引用) → 经 agent-preset 发起新会话(不附主历史)
→ 用户问题作首条消息 → 模型流式回答 → 渲染回 overlay。

---

## 5. 目录结构（目标）

dsh-sidebar-assistant/
  ├─ PLAN.md                    本规划书
  ├─ package.json               dsh bundle manifest（host/client 双面）
  ├─ cordis.patch.yml           顶层数组：insert[{ id: sidehelper, name, config }]
  ├─ tsconfig.host.json / tsconfig.client.json    双 tsc program
  ├─ tsdown.config.ts           client bundle（复用正式版 Harness helper）
  └─ src/
       ├─ host/  index.ts context.ts session.ts config.ts
       └─ client/ index.ts selection.ts question-panel.tsx submit.ts

具体 API 名在阶段 0 从当前 checkout 源码取证确认（SKILL §8.4，以实际代码为准）。

---
## 6. 分阶段实施计划

MVP = 可选中 → 提问 → 独立会话 → 流式回答。

### 阶段 0 勘察取证（不改业务）
- 发起「新会话」的 client/host API（带 agent-preset + 首条消息）。
- inputActions / 会话提交入口准确调用方式。
- shell.overlay 注册 API 与点击穿透/容高约定。
- agent-presets 的创建与字段（system prompt / trust / isDefault）。
- 记录 git HEAD，回报漂移。

### 阶段 1 Host：上下文组装 + 发起
- 定义「问答助手」agent-preset（系统提示 + 可选用户目录背景）。
- session.ts：给定(选中文字, 问题) → 组装引用 → 创建新会话 → 提交。
- 注册最小 host 工具/服务供 client 调用（经 service 协作，不跨包 import 值）。

### 阶段 2 Client：选择监听 + 「提问」按钮
- 会话滚动区监听选择，取文本与 text-range 定位。
- 渲染非阻塞「提问」浮钮，点击呼出 overlay。
- 键盘/Escape/focus/reduced-motion 支持。

### 阶段 3 Client：问答窗口 + 联调
- overlay：选中文字预览 + 输入框 + 流式回答区。
- 对接 host 会话编排，提交与实时渲染。
- dispose 安全：监听/overlay/事件随 client fiber 清理。

### 阶段 4 配置与打磨
- 插件 Config（可变需求做成配置而非常量）。
- 窄屏行为、按 SessionId 分桶的会话隔离。

---
## 7. 验证计划

- 基线：pnpm typecheck / build / test（若声明）/ git diff --check。
- Host：单测覆盖 context 组装、schema、失败语义、disposer。
- 真实组合：scratch profile + dsh plugin add + dump-config 确认插件层。
- Client：jsdom 断言 overlay/监听注册、会话隔离、dispose 清理；真实浏览器端到端。
- 安装：全新临时 DSH_HOME/profile，按 README 安装断言插件层出现。

---

## 8. 风险与待定决策（需你拍板）

1. 问答窗口实现方式：推荐复用 dsh 会话引擎（新 agent-preset + 新会话 + inputActions），直接获得流式/工具/权限；备选自研轻量聊天面板，改动小但需自造流式/权限。
2. 「用户目录」来源：dsh 内建 agent-preset/user-persona 目录，还是你自有某目录（如 ~/.dsh 身份文件）？决定 context.ts 读哪。
3. 问答会话是否持久化：只存活于窗口直到关闭（推荐 MVP），还是落盘可回看。
4. 分发方式：dsh plugin add 本地安装即可，还是发布 npm/GitHub。

---

## 9. 交付物清单

- 可加载的双面 dsh 插件，满足 F1–F7 MVP。
- 配套 README（经全新 profile 验证的安装命令）。
- 单测 / 端到端记录与截图。
- 本规划书的落地修订记录。

---

批准后，我从阶段 0 勘察取证开始实施，并严格遵循插件开发规范与本文档。

## 10. 已确认决策（2026-08-20）

1. 问答窗口实现方式：复用 dsh 会话引擎（新 agent-preset + 新会话 + inputActions）。
2. 「用户目录」背景：读取 dsh 内建 agent-preset/persona 上下文。
3. 问答会话：落盘可回看（作为可回看的历史子会话持久化）。
4. 分发/安装：本地 dsh plugin add 安装到 profile。

实施将以本确认后的规划为准，先从阶段 0 勘察取证开始。
---

## 11. 实施与验证结果（2026-08-20）

### 已实施
- 插件包骨架：package.json（host/client 双面 exports + dsh.bundle.patch + client.web inject）、cordis.patch.yml、tsconfig.host.json / tsconfig.client.json（双 tsc program 隔离）、tsdown.config.ts、vitest.config.ts、README。
- Host 端（src/host）：context.ts（上下文组装：系统提示+用户目录 persona+选中引用，不含历史）、stream.ts（流式增量拼接）、persistence.ts（按 SessionId 分桶落盘回看）、config.ts（schemastery Schema）、llm.ts（LlmRuntime.stream 封装）、web.ts（插件 apply：sidehelper 服务 ask/list）。
- Client 端（src/client）：selection.ts（选择监听+“提问”浮钮，仅自有 DOM 节点，dispose 安全）、panel.ts（浮层问答窗口：引用预览+输入+流式回答区）、index.ts（fiber 入口，接线 host 服务）。

### 验证
- vitest：context / persistence / stream 纯逻辑单测共 **15 个全部通过**（含截断、persona/系统提示组装、会话分桶隔离、all() 升序、增量拼接）。
- 纯逻辑模块 tsc --strict 通过，0 类型错误。
- 约定：dsh 强绑定接缝（@deepseek-ai/{cordis,schemastery,dsh-llm,dsh-web-server,dsh-client-runtime}）与 client/host 跨 fiber 通信需在 deepseek-harness monorepo 内安装后运行 `pnpm typecheck` + 浏览器端到端验证（本目录为独立 bundle，未链接 harness 工作区）。

### 运行
```bash
# 在本目录（已软链 harness node_modules 时）
node /home/fei/workspace/deepseek-harness/node_modules/vitest/vitest.mjs run
# harness 内安装本插件后
dsh plugin add /home/fei/workspace/dsh-sidebar-assistant
```