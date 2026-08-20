/* (c) 2026 dsh-sidehelper - 按引用文字过滤会话 turn 的纯函数（可单测） */

/** History filter 投影：仅关心 role 与 文本。 */
export interface TurnLike {
  role: 'user' | 'assistant' | 'system'
  text: string
}

/** 判定一条 turn 是否"命中"选中的引用：
 *  - 单向包含：消息文本包含引用 → 这是引用的"来源 turn"，是命中。
 *  - 不做"引用包含消息文本"的反向匹配：避免用户选中较长片段时，
 *    把恰好是该片段子串的其它无关短消息误判命中。
 *  - 引用为空 / 消息文本为空：永不命中。
 *  - 不区分大小写；忽略首尾空白。 */
export function isTurnMatchingQuote(turn: TurnLike, quoted: string): boolean {
  const q = quoted.trim()
  if (!q) return false
  const t = turn.text.trim()
  if (!t) return false
  return t.toLowerCase().includes(q.toLowerCase())
}

/** 根据引用过滤 history（按"对话回合"成对保留）：
 *  - 直接命中的 turn 原样保留。
 *  - 同时保留其"对话伙伴"：
 *      user / steering / system  → 紧邻其后的最近一个 assistant；
 *      assistant                 → 紧邻其前的最近一个 user/steering/system。
 *  - 按原始顺序输出、并去重。空引用或无命中时返回空数组。
 *  - 不做字符预算截断：仍由 host 的 buildUserMessage 统一处理（每条 2000 / 总 8000）。 */
export function filterTurnsByQuote<T extends TurnLike>(
  turns: readonly T[],
  quoted: string,
): T[] {
  const q = quoted.trim()
  if (!q || turns.length === 0) return []

  const matched = new Set<number>()
  for (let i = 0; i < turns.length; i++) {
    if (isTurnMatchingQuote(turns[i], q)) matched.add(i)
  }
  if (matched.size === 0) return []

  /** 把 (idx, role) 的对话伙伴索引算出来；可能为 null（没有合适 partner）。 */
  function partnerIndex(idx: number, role: TurnLike['role']): number | null {
    if (role === 'assistant') {
      for (let j = idx - 1; j >= 0; j--) {
        const r = turns[j].role
        if (r === 'user' || r === 'system') return j
      }
      return null
    }
    // user / system：向后找最近的 assistant
    for (let j = idx + 1; j < turns.length; j++) {
      if (turns[j].role === 'assistant') return j
    }
    return null
  }

  const keep = new Set<number>(matched)
  for (const i of matched) {
    const p = partnerIndex(i, turns[i].role)
    if (p !== null) keep.add(p)
  }

  const out: T[] = []
  for (let i = 0; i < turns.length; i++) {
    if (keep.has(i)) out.push(turns[i])
  }
  return out
}
