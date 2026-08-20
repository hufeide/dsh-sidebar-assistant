import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-runtime'
import { createSelectionWatcher } from './selection.js'
import { createQuestionPanel } from './panel.js'
import { filterTurnsByQuote } from './history-filter.js'

export const inject = ['sessions'] as const

interface AskBody {
  sessionId: string
  quoted: string
  question: string
  history?: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>
  totalTurns?: number
}

interface ClientNodeText {
  role: 'user' | 'assistant' | 'system'
  text: string
}

/** 从一段 ContentBlock[] 中仅抽出纯文本（type==='text'）。未知结构静默忽略。 */
function extractContentText(blocks: readonly unknown[]): string {
  let out = ''
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text') {
      const t = (b as { text?: unknown }).text
      if (typeof t === 'string') out += t
    }
  }
  return out.trim()
}

/** 从 AssistantMessageNode.blocks 中仅抽出文本（kind==='text'），跳过 reasoning/tool-call 等。 */
function extractAssistantText(blocks: readonly unknown[]): string {
  let out = ''
  for (const b of blocks) {
    if (b && typeof b === 'object' && (b as { kind?: unknown }).kind === 'text') {
      const t = (b as { text?: unknown }).text
      if (typeof t === 'string') out += t
    }
  }
  return out.trim()
}

/** 抽取「选中所处会话」的历史消息，并按"用户引用文字"过滤。
 *  - 仅遍历 binding.session.getSnapshot().nodes，过滤掉其他会话。
 *  - 按时间（seq）顺序、规范化 role，丢弃空文本。
 *  - 抽取得到全量 turn 之后，调用 filterTurnsByQuote 做引用命中 + 回合配对，
 *    只把与引用相关的 user/assistant 保留下来送入 prompt。
 *    quoted 为空 / 无命中时返回 []，模型只看到引用 + 问题本身。
 *  - 返回 [filtered, totalTurns]：前者直接送入 host；后者供面板 UI 与日志诊断用。 */
function extractSessionHistory(
  sessions: any,
  currentId: string,
  quoted: string,
): { filtered: ClientNodeText[]; totalTurns: number } {
  if (!currentId) return { filtered: [], totalTurns: 0 }
  const binding = typeof sessions?.binding === 'function' ? sessions.binding(currentId) : undefined
  const session = binding?.session
  if (!session || typeof session.getSnapshot !== 'function') return { filtered: [], totalTurns: 0 }
  const snap = session.getSnapshot()
  const nodes = Array.isArray(snap?.nodes) ? snap.nodes : []
  const all: ClientNodeText[] = []
  for (const n of nodes) {
    if (!n || typeof n !== 'object') continue
    const kind = (n as { kind?: unknown }).kind
    if (kind === 'user') {
      const text = extractContentText((n as { content?: readonly unknown[] }).content ?? [])
      if (text) all.push({ role: 'user', text })
    } else if (kind === 'steering') {
      // steering 来自同一用户追加的消息，归到 user。
      const text = extractContentText((n as { content?: readonly unknown[] }).content ?? [])
      if (text) all.push({ role: 'user', text })
    } else if (kind === 'assistant') {
      const text = extractAssistantText((n as { blocks?: readonly unknown[] }).blocks ?? [])
      if (text) all.push({ role: 'assistant', text })
    } else if (kind === 'context') {
      const text = extractContentText((n as { content?: readonly unknown[] }).content ?? [])
      if (text) all.push({ role: 'system', text })
    }
    // 其他 kind（tool-result / model-retry / turn-error / 等）跳过
  }
  const filtered = filterTurnsByQuote(all, quoted)
  return { filtered, totalTurns: all.length }
}

/** 流片段：'delta' = 正文增量，'think' = 思考增量，'done' = 结束（带完整 answer），'error' = 失败。 */
export interface StreamPiece {
  type: 'delta' | 'think' | 'done' | 'error'
  text?: string
  answer?: string
  error?: string
}

/** fetch with client-side timeout so a hung host never spins the button forever. */
async function fetchWithTimeout(input: string, init: RequestInit = {}, ms = 65_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(input, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** 按行解析 SSE 流（data: {...}\n\n），逐片回调给前端做实时渲染。 */
function parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>, onPiece: (p: StreamPiece) => void): Promise<void> {
  const decoder = new TextDecoder()
  let buf = ''
  const pump = (): Promise<void> =>
    reader.read().then(({ done, value }) => {
      if (done) {
        if (buf.trim()) {
          const m = /^data:\s*(.*)$/m.exec(buf)
          if (m) try { onPiece(JSON.parse(m[1])) } catch { /* 忽略坏帧 */ }
        }
        return
      }
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const m = /^data:\s*(.*)$/m.exec(frame)
        if (m) {
          try { onPiece(JSON.parse(m[1])) } catch { /* 忽略坏帧 */ }
        }
      }
      return pump()
    })
  return pump()
}

/** Call the host-side HTTP bridge (same-origin), streamed via SSE. */
async function askHost(body: AskBody, onPiece: (p: StreamPiece) => void): Promise<void> {
  const res = await fetchWithTimeout('/sidehelper/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`host ask failed: HTTP ${res.status}`)
  if (!res.body) throw new Error('host ask failed: empty stream')
  await parseSSE(res.body.getReader(), onPiece)
}

export function apply(ctx: Context): void {
  const fiber = ctx.fiber
  const config = (fiber?.config ?? {}) as { placeholder?: string }
  const host = (document.querySelector('[data-conversation]') ?? document.body) as HTMLElement
  const panel = createQuestionPanel({ placeholder: config.placeholder })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessions = (ctx as any).sessions as { list: { getSnapshot(): { current?: string } } }

  const watcher = createSelectionWatcher(document, host, (quoted, rect) => {
    void rect
    const sessionId = sessions.list.getSnapshot().current ?? ''
    // 抽取「选中所处会话」的历史，并按"用户引用文字"过滤：
    //   只把命中引用的 turn 与其对话伙伴送入 prompt，其他 turn 不进入 history，
    //   大幅减少送入上下文的 token 开销，与提问主题保持一致。
    const { filtered, totalTurns } = extractSessionHistory(sessions, sessionId, quoted)
    // 诊断日志：方便定位 "为什么历史看起来还是全部" 这类问题。
    const diag = {
      sessionId,
      quotedChars: quoted.length,
      quotedPreview: quoted.slice(0, 60),
      totalTurns,
      keptTurns: filtered.length,
      kept: filtered.map((t) => `${t.role}:${t.text.slice(0, 40)}`),
    }
    console.info('[sidehelper] context filter', diag)
    panel.open(
      quoted,
      (question, onPiece) =>
        askHost({ sessionId, quoted, question, history: filtered, totalTurns }, onPiece),
    )
  })

  watcher.start()

  ctx.effect(() => () => {
    watcher.stop()
    panel.dispose()
  })
}