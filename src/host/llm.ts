import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { collectText, type TextDelta } from './stream.js'

type LlmRuntimeT = InstanceType<typeof LlmRuntime>

/** 流片段：'delta' = 最终回答正文；'think' = 思考过程（reasoning）。 */
export interface StreamPiece {
  kind: 'delta' | 'think'
  text: string
}

async function* toPieces(chunks: AsyncIterable<StreamChunk>): AsyncIterable<StreamPiece> {
  for await (const chunk of chunks) {
    // dsh-llm StreamChunk 是带 `type` 判别联合：
    //  - `reasoning-delta` 是模型思考过程（思考链）
    //  - `text-delta` 是最终回答正文
    // reasoning 与正文天然分离，无需解析文本里的 think 标签，但保留文本兜底。
    if (chunk.type === 'reasoning-delta') {
      if (chunk.text) yield { kind: 'think', text: chunk.text }
    } else if (chunk.type === 'text-delta') {
      if (chunk.text) yield { kind: 'delta', text: chunk.text }
    }
  }
}

async function* toDeltas(chunks: AsyncIterable<StreamChunk>): AsyncIterable<TextDelta> {
  for await (const chunk of chunks) {
    if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
      if (chunk.text) yield { delta: chunk.text }
    }
  }
}

export async function requestCompletion(
  llm: LlmRuntimeT,
  options: GenerateOptions,
): Promise<string> {
  const opts: GenerateOptions = { ...options, signal: AbortSignal.timeout(30_000) }
  return collectText(toDeltas(llm.stream(opts)))
}

/** 流式版：逐块产出 think / delta，供 SSE 推给前端做实时渲染。 */
export async function* streamCompletion(
  llm: LlmRuntimeT,
  options: GenerateOptions,
): AsyncIterable<StreamPiece> {
  const opts: GenerateOptions = { ...options, signal: AbortSignal.timeout(60_000) }
  yield* toPieces(llm.stream(opts))
}
