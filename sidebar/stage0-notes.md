# deepseek-harness stage0 API 取证笔记（只读）
> 仓库：/home/fei/workspace/deepseek-harness | git HEAD: 47f943859bef60e4160492346772ded9b24f765a

## Item1 Agent-preset 定义（host）
- 契约: packages/host/apiproxy/src/api/agent-presets.ts
  - AgentPresetEntry 16-43: {id;trust:'system'|'user';isDefault;name?;description?;broken?}
  - AgentPresetsApi 46-115 (map key agentPreset.*): list/select/read/copy/openDocument/remove
- Zod: packages/host/apiproxy/src/api/agent-presets.schema.ts (agentPresetEntrySchema 13-20)
- 服务: packages/preset/agent-presets/src/index.ts
  - mount() 275-288; composeFrom() 316-325; composedPreset() 336-338; roots 346-348; authorable 351-353
  - read() 361-363; copy() 380-393; remove() 400-416; serviceFor() 433-435; recompose() 458-472; standingKeyFor() 485-488
- preset=目录式(agent.cordis.yml+preset.yml), 例 apps/cli/config/agent-presets/standard/
## Item2 用户个人画像(persona)上下文
- packages/core/system-prompt/src/index.ts
  - PERSONA_SECTION='deployment:persona' 128; PERSONA_ORDER=0 131; class SystemPrompt extends Service 338
  - persona section 注册 364-366; section() 381; 事件 system-prompt/assemble(waterfall)/change
- packages/preset/persona/src/index.ts
  - name='persona' 28; inject=['systemPrompt'] 31; Config{text;complete?;includeRuntimeContext?} 34-52
  - apply() 60-67: ctx.systemPrompt.section({name:PERSONA_SECTION,order:PERSONA_ORDER,text,...})
  - agent.cordis.yml: - id: persona, name: '@deepseek-ai/dsh-persona' (scope-only shadow), {{model}}/{{cwd}} 插值

## Item3 host 调用 LLM 流式完成
- packages/llm/llm/src/index.ts
  - LlmRuntime extends Service 284+; stream(options:GenerateOptions):AsyncIterable<StreamChunk> (llm/stream waterfall 64)
  - prepareCall(config,signal?):Promise<PreparedLlmCall> 779-811; LlmAdapter 180+ abstract stream 230-232
- packages/llm/llm/src/types.ts: StreamChunk 291+ (block-start|text-delta|reasoning-delta|tool-call-delta|block-end|usage|finish replayState?); GenerateOptions 320+; ToolSchema 302-311

## Item4 会话创建 / 绑定 agent-preset
- packages/core/agent/src/index.ts
  - interface AgentRegistry 202+; class AgentRegistry extends Service 256; create() 405
  - CreateAgentOptions 80+，meta.agentPreset? 100 行: {sessionId; meta?.agentPreset; seed?; agentOptions?; signal?; setup?}
  - meta.agentPreset 绑定 preset；ReactLoopAgent 驱动消息+LLM

## Item5 Client->Host 调用模式
- Host: packages/feedback/message-feedback/src/index.ts
  - class MessageFeedbackService extends TypertRemoteService 150
  - spec: packages/feedback/message-feedback/src/spec.ts defineDomain(message_feedback,version 0) 84-93
  - @Remote('list') 189; @Remote('put') 205; @Remote('delete') 271
- Client 装配: packages/api/remotes/src/client/index.ts 1-30: 引入各 remote，ctx.remote.<ns>.<method>

## Item6 Client 最小入口与 slot 注册
- 入口: packages/client/ui-message-feedback/src/client/index.ts
  - inject=['slots','remote','remote.messageFeedback','locale'] 32; apply(ctx) 39-84
  - controller per-session 42-50; connection/reset resync 54-58
  - ctx.slots.inject('conversation.chat.assistant-actions', register{name,id:'feedback',order:10,locale:NS,inject}) 60-83
- face: packages/client/ui-message-feedback/src/client/slots.ts MessageFeedbackInjected 22-58; ActionProps 61-64
- 槽声明: packages/client/ui-conversation/src/client/apply.ts conversation.input.overlay(kind:list,scope:session) 196-204; composer 239/278/371/429

## Item7 Client 感知当前 SessionId 与 UI 根
- packages/client/ui-conversation/src/client/stores.ts
  - createChatStore():EngineStoreHandle<ChatStoreState,ChatActions> 20-37 (defineStore, persist 'dsh.conversation.chat')
  - 会话根: dsh-client-runtime 的 ClientContext；槽位 inject(sessionId) 见 ui-message-feedback index.ts 66；scope session 按会话展开;渲染根由平台主机持有

## Item8 插件工程骨架(ui-message-feedback 模板)
- package.json: packages/client/ui-message-feedback/package.json
  - name @deepseek-ai/dsh-client-ui-message-feedback; type:module; exports 细分 5-23
  - dsh.client{inject:[runtime,api-remotes,locale,ui-conversation],platform:web} 24-34; scripts bundle=tsdown
- tsconfig.json: extends ../../../tsconfig.base.client.json; rootDir src; references(cordis/api-remotes/message-feedback/...)
- tsdown.config.ts: clientBundle('@deepseek-ai/dsh-client-ui-message-feedback',['lib/types/index.js','lib/types/invariant.js'])

## 附录 关键目录
- host/apiproxy/src/api/; preset/{agent-presets,persona}/; core/system-prompt/; llm/llm/; core/agent/(+dsh-agent-loop)
- feedback/message-feedback/; api/remotes/; client/ui-message-feedback/; client/ui-conversation/
