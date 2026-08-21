# dsh-sidehelper

DSH 插件：在 dsh 会话中“选中即问”。左键选中会话中的文字，文字下方出现「提问」按钮；点击后在浮层问答窗口中输入问题，以选中文字为引用、复用系统提示与用户目录(persona)为背景，发起一个与主会话解耦的后台问答会话，结果流式展示并可持久化回看。

## 功能
- 监听会话内文字选择，弹出「提问」浮钮（仅作用于自有 DOM 节点）
- 浮层问答窗口：选中文字预览 + 输入框 + 流式回答区
- 复用 dsh 会话引擎：新 agent-preset「问答助手」+ 新会话 + 提交通道
- 上下文组装：系统提示 + 用户目录(persona) + 选中文字引用，不含主会话历史
- 按 SessionId 分桶持久化问答记录，落盘可回看
- 配置：model / personaText / persistDir / maxQuotedChars

## 开发
```
pnpm typecheck   # 双 tsc program 类型检查
pnpm test        # vitest 单测
pnpm build:client# tsdown 打包 client bundle
```

## 安装
```
dsh plugin add ./dsh-sidebar-assistant
```

## 目录结构
```
src/
  host/    Host 端服务（config/context/llm/persistence/web/index）
  client/  Client 端（selection / panel / index）
  types/   共享类型
test/      单测
```