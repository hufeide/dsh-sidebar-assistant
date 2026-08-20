import * as nodePath from 'node:path'
import * as nodeFs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { Config } from './config.js'
import type { AskRequest, AnswerRecord, SideHelperConfig } from '../types/index.js'
import { buildSystemPrompt, buildUserMessage } from './context.js'
import type { HistoryMessage } from '../types/index.js'
import { Persistence } from './persistence.js'
import { requestCompletion, streamCompletion } from './llm.js'

export const name = 'sidehelper'
export const inject = ['llm', 'webServer', 'agentDefaultModel']

type LlmRuntimeT = InstanceType<typeof LlmRuntime>

/** Collect the full UTF-8 request body. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

/** Minimal JSON reply with an explicit no-store cache policy. */
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

export function apply(ctx: Context, config: SideHelperConfig): void {
  if (!config.enabled) return

  // 诊断日志放在插件根目录下的 .sidehelper（绝对路径，避免依赖 harness cwd）。
  const pluginRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const baseDir = config.persistDir || nodePath.join(pluginRoot, '.sidehelper')
  const store = new Persistence(baseDir)

  // 当前生效的调用配置：优先被客户端上报的会话模型覆盖，否则回退到配置或自动探测。
  const activeCall: { provider?: string; model?: string } = {}
  if (config.provider) activeCall.provider = config.provider
  if (config.model) activeCall.model = config.model

  /** 读取 harness 当前默认会话模型（用户正在使用的 provider/model）。 */
  function defaultSelection(): { provider?: string; model?: string } {
    const adm = (ctx as unknown as { agentDefaultModel?: { currentSelection(): { provider: string; model: string } } }).agentDefaultModel
    if (adm && typeof adm.currentSelection === 'function') {
      try {
        const s = adm.currentSelection()
        if (s?.provider && s?.model) return { provider: s.provider, model: s.model }
      } catch {
        /* 服务未就绪时忽略，回退到探测 */
      }
    }
    return {}
  }

  /** 解析 provider/model：客户端上报 > harness 默认会话模型 > 插件配置 > 自动探测首个可用。
   *  provider 必须落在 LlmRuntime 已注册列表内，否则 resolveCallConfig 会抛 NO_ADAPTER。 */
  async function detectCallConfig(): Promise<{ provider: string; model: string }> {
    const llm = ctx.llm as LlmRuntimeT
    const providers = llm.listProviders()
    if (providers.length === 0) {
      throw new Error('no LLM provider is registered; configure a provider/model for sidehelper')
    }
    const known = new Set(providers.map((p) => p.id))
    const hint = { ...defaultSelection(), ...activeCall }

    // provider 只在已注册列表中采纳；否则回退到首个可用 provider。
    let provider: string
    if (hint.provider && known.has(hint.provider)) provider = hint.provider
    else provider = providers[0].id

    const modelsFor = await llm.listModels(provider)
    const modelIds = new Set(modelsFor.map((m) => m.id))

    let model = hint.model
    if (!model || (modelIds.size > 0 && !modelIds.has(model))) {
      // 显式/默认模型不可用（或不存在），自动探测该 provider 首个模型。
      if (modelsFor.length === 0) {
        throw new Error(`provider "${provider}" exposes no models; configure a model for sidehelper`)
      }
      model = modelsFor[0].id
    }
    return { provider, model }
  }

  /** One complete ask against the configured LLM, durably recorded. */
  async function ask(req: AskRequest): Promise<AnswerRecord> {
    const system = buildSystemPrompt(config.systemPrompt, config.personaText)
    const userContent = buildUserMessage(req.quoted, req.question)

    // 解析真实 provider/model：客户端上报 > 插件配置 > 自动探测首个可用。
    const detected = await detectCallConfig()
    const resolved = await (ctx.llm as LlmRuntimeT).resolveCallConfig({
      provider: detected.provider,
      model: detected.model,
    } as { provider: string; model: string })

    const messages: GenerateOptions['messages'] = [
      createMessage({
        role: 'system',
        content: [{ type: 'text', text: system }],
        source: { kind: 'user' },
      }) as GenerateOptions['messages'][number],
      createMessage({
        role: 'user',
        content: [{ type: 'text', text: userContent }],
        source: { kind: 'user' },
      }) as GenerateOptions['messages'][number],
    ]

    const opts: GenerateOptions = {
      ...resolved,
      messages,
    } as GenerateOptions

    const answer = await requestCompletion(ctx.llm as LlmRuntimeT, opts)
    const rec: AnswerRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: req.sessionId,
      createdAt: Date.now(),
      quoted: req.quoted,
      question: req.question,
      answer,
      model: resolved.model,
    }
    await store.append(rec)
    return rec
  }

  /** 把一次提问以 SSE 流式推给浏览器：think（思考）与 delta（正文）分段下发，结束发 done。 */
  async function handleAskStream(res: ServerResponse, req: AskRequest): Promise<void> {
    // SSE 头：关闭缓冲、禁用缓存，确保逐块到达前端。
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    const send = (obj: unknown) => {
      res.write(`data: ${JSON.stringify(obj)}\n\n`)
    }

    const system = buildSystemPrompt(config.systemPrompt, config.personaText)
    const userContent = buildUserMessage(req.quoted, req.question, req.history)
    const detected = await detectCallConfig()
    const resolved = await (ctx.llm as LlmRuntimeT).resolveCallConfig({
      provider: detected.provider,
      model: detected.model,
    } as { provider: string; model: string })

    const messages: GenerateOptions['messages'] = [
      createMessage({
        role: 'system',
        content: [{ type: 'text', text: system }],
        source: { kind: 'user' },
      }) as GenerateOptions['messages'][number],
      createMessage({
        role: 'user',
        content: [{ type: 'text', text: userContent }],
        source: { kind: 'user' },
      }) as GenerateOptions['messages'][number],
    ]
    const opts: GenerateOptions = { ...resolved, messages } as GenerateOptions

    let full = ''
    try {
      for await (const piece of streamCompletion(ctx.llm as LlmRuntimeT, opts)) {
        full += piece.text
        send({ type: piece.kind, text: piece.text })
      }
      // 持久化完整回答（思考 + 正文合并为可读记录）
      const rec: AnswerRecord = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId: req.sessionId,
        createdAt: Date.now(),
        quoted: req.quoted,
        question: req.question,
        answer: full,
        model: resolved.model,
      }
      await store.append(rec)
      send({ type: 'done', answer: full })
    } catch (err) {
      const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
      ctx.logger.warn('[sidehelper] ask stream failed:', detail)
      try {
        nodeFs.mkdirSync(baseDir, { recursive: true })
        nodeFs.writeFileSync(
          nodePath.join(baseDir, 'ask-error.log'),
          `[${new Date().toISOString()}]\n${detail}\n\n`,
          { flag: 'a' },
        )
      } catch {
        /* 写日志失败忽略 */
      }
      send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      res.end()
    }
  }

  ctx.provide('sidehelper', {
    ask,
    async list(sessionId: string): Promise<AnswerRecord[]> {
      return store.list(sessionId)
    },
  })

  // The browser client reaches the host over HTTP: the typert remote assembly
  // (packages/api/remotes) is a closed build-time set that third-party plugins
  // cannot extend, so `ctx.remote.sidehelper` is never available. Same-origin
  // fetch against the host web server is the plugin-level bridge.
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    ctx.effect(() => {
      const disposeAsk = webServer.register({
        kind: 'exact',
        path: '/sidehelper/ask',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }
          let body: unknown
          try {
            body = JSON.parse(await readBody(req)) as unknown
          } catch {
            json(res, 400, { ok: false, error: 'invalid-json' })
            return
          }
          const { sessionId, quoted, question, history } = (body ?? {}) as {
            sessionId?: string
            quoted?: string
            question?: string
            history?: HistoryMessage[]
          }
          if (typeof sessionId !== 'string' || typeof question !== 'string') {
            json(res, 400, { ok: false, error: 'missing-fields' })
            return
          }
          try {
            await handleAskStream(res, {
              sessionId,
              quoted: typeof quoted === 'string' ? quoted : '',
              question,
              history: Array.isArray(history)
                ? history.filter(
                    (m): m is HistoryMessage =>
                      !!m &&
                      typeof m.text === 'string' &&
                      (m.role === 'user' || m.role === 'assistant' || m.role === 'system'),
                  )
                : undefined,
            })
          } catch (err) {
            const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
            ctx.logger.warn('[sidehelper] ask failed:', detail)
            try {
              nodeFs.mkdirSync(baseDir, { recursive: true })
              nodeFs.writeFileSync(
                nodePath.join(baseDir, 'ask-error.log'),
                `[${new Date().toISOString()}]\n${detail}\n\n`,
                { flag: 'a' },
              )
            } catch {
              /* 写日志失败忽略 */
            }
            let diag: Record<string, unknown> = {}
            try {
              diag = {
                providers: (ctx.llm as LlmRuntimeT).listProviders().map((p) => p.id),
                hasAdm: typeof (ctx as unknown as { agentDefaultModel?: unknown }).agentDefaultModel === 'object',
                activeCall,
              }
            } catch {
              /* 收集诊断失败忽略 */
            }
            json(res, 500, {
              ok: false,
              error: err instanceof Error ? err.message : String(err),
              diag,
            })
          }
        },
      })
      const disposeConfig = webServer.register({
        kind: 'exact',
        path: '/sidehelper/config',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }
          let body: unknown
          try {
            body = JSON.parse(await readBody(req)) as unknown
          } catch {
            json(res, 400, { ok: false, error: 'invalid-json' })
            return
          }
          const { provider, model } = (body ?? {}) as { provider?: string; model?: string }
          if (typeof provider === 'string' && provider.length > 0) activeCall.provider = provider
          if (typeof model === 'string' && model.length > 0) activeCall.model = model
          json(res, 200, { ok: true, active: activeCall })
        },
      })
      const disposeHealth = webServer.register({
        kind: 'exact',
        path: '/sidehelper/health',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.writeHead(405)
            res.end()
            return
          }
          let info: Record<string, unknown> = {}
          try {
            const providers = (ctx.llm as LlmRuntimeT).listProviders()
            info = {
              ok: true,
              providers: providers.map((p) => p.id),
              hasAdm: typeof (ctx as unknown as { agentDefaultModel?: { currentSelection(): unknown } }).agentDefaultModel?.currentSelection === 'function',
              activeCall,
            }
            if (info.hasAdm) {
              try {
                const sel = (ctx as unknown as { agentDefaultModel: { currentSelection(): unknown } }).agentDefaultModel.currentSelection()
                info.defaultSelection = sel
              } catch (e) {
                info.defaultSelectionError = e instanceof Error ? e.message : String(e)
              }
            }
          } catch (e) {
            info = { ok: false, error: e instanceof Error ? e.message : String(e) }
          }
          json(res, 200, info)
        },
      })
      const disposeTest = webServer.register({
        kind: 'exact',
        path: '/sidehelper/test',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.writeHead(405)
            res.end()
            return
          }
          let info: Record<string, unknown> = { ok: false }
          try {
            const detected = await detectCallConfig()
            const resolved = await (ctx.llm as LlmRuntimeT).resolveCallConfig({ provider: detected.provider, model: detected.model })
            const probeMessages = [
              createMessage({ role: 'system', content: [{ type: 'text', text: 'You are a test probe. Reply with the single word OK.' }], source: { kind: 'user' } }),
              createMessage({ role: 'user', content: [{ type: 'text', text: 'ping' }], source: { kind: 'user' } }),
            ]
            const sample = await requestCompletion(ctx.llm as LlmRuntimeT, { ...resolved, messages: probeMessages })
            info = { ok: true, provider: detected.provider, model: detected.model, answerLen: sample.length, sample: sample.slice(0, 200) }
          } catch (e) {
            const detail = e instanceof Error ? (e.stack ?? e.message) : String(e)
            try {
              nodeFs.mkdirSync(baseDir, { recursive: true })
              nodeFs.writeFileSync(nodePath.join(baseDir, 'ask-error.log'), `[${new Date().toISOString()}]\n[test] ${detail}\n\n`, { flag: 'a' })
            } catch {
              /* 忽略 */
            }
            info = {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
              diag: { providers: (ctx.llm as LlmRuntimeT).listProviders().map((p) => p.id), activeCall },
            }
          }
          json(res, 200, info)
        },
      })
      const disposeList = webServer.register({
        kind: 'exact',
        path: '/sidehelper/list',
        handler: async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'GET') {
            res.writeHead(405)
            res.end()
            return
          }
          const url = new URL(req.url ?? '/', 'http://x')
          const sessionId = url.searchParams.get('sessionId') ?? ''
          const items = await store.list(sessionId)
          json(res, 200, { ok: true, items })
        },
      })
      ctx.logger.info('sidehelper: http routes registered at /sidehelper/{ask,config,test,list}')
      return () => {
        disposeAsk()
        disposeConfig()
        disposeHealth()
        disposeTest()
        disposeList()
      }
    }, 'sidehelper: http routes')
  } else {
    ctx.logger.error('sidehelper: webServer NOT available; the browser client cannot reach the host service (requests will fail with HTTP 500 from the proxy)')
  }
}

apply['Config'] = Config
