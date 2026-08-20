/* (c) 2026 dsh-sidehelper - 流式增量化简（纯函数，可单测） */

export interface TextDelta {
  delta: string
}

/** 把增量流拼成完整文本 */
export async function collectText(deltas: AsyncIterable<TextDelta>): Promise<string> {
  let out = ''
  for await (const d of deltas) {
    if (d && typeof d.delta === 'string') out += d.delta
  }
  return out
}

/** async generator 帮助函数：方便构造假流做单测 */
export async function* fromStrings(list: Iterable<string>): AsyncIterable<TextDelta> {
  for (const s of list) yield { delta: s }
}