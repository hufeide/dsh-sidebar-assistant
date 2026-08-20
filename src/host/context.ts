/* (c) 2026 dsh-sidehelper - 上下文组装（纯函数，可单测） */

/** 截断引用文字到最大长度，避免超长上下文 */
export function clampQuoted(text: string, maxChars: number): string {
  const t = text.trim()
  if (maxChars <= 0) return t
  if (t.length <= maxChars) return t
  return t.slice(0, maxChars) + '\n…（已截断）'
}

/** 组装系统提示：用户目录(persona) + 系统提示。均缺省时给默认助手。 */
export function buildSystemPrompt(systemPrompt: string, personaText: string): string {
  const sections: string[] = []
  const persona = personaText.trim()
  const sys = systemPrompt.trim()
  if (persona) sections.push(`【用户目录 / 个人信息】\n${persona}`)
  if (sys) sections.push(`【系统提示】\n${sys}`)
  if (sections.length === 0) sections.push('你是一个乐于助人的问答助手，请根据给定引用内容回答问题。')
  return sections.join('\n\n')
}

/** 组装用户首条消息：会话历史（仅选中所处会话）→ 选中引用 → 用户问题。
 *  history 为空/未传时回退到无历史的旧格式。
 *  严格只使用传入的 history（其他会话历史不会出现在这里）。 */
export function buildUserMessage(
  quoted: string,
  question: string,
  history?: ReadonlyArray<{ role: 'user' | 'assistant' | 'system'; text: string }>,
): string {
  const q = question.trim()
  const quote = clampQuoted(quoted, 4000)
  const body = quote || '（未提供引用文字）'

  const parts: string[] = []
  parts.push('请基于下面【用户引用】的内容回答问题。')
  parts.push('参考【当前会话历史】了解上下文，不要臆测引用之外的事实。')
  parts.push('')

  if (history && history.length > 0) {
    const lines: string[] = ['【当前会话历史】（按对话顺序，仅包含本次提问所在的会话）']
    let total = 0
    const budget = 8000 // 历史总字符预算，避免撑爆上下文
    for (const m of history) {
      const roleLabel = m.role === 'assistant' ? '助手' : m.role === 'system' ? '系统' : '用户'
      const text = clampQuoted(m.text, 2000)
      if (!text) continue
      if (total + text.length > budget) {
        lines.push(`${roleLabel}：…（后续历史已截断）`)
        break
      }
      lines.push(`${roleLabel}：${text}`)
      total += text.length
    }
    parts.push(lines.join('\n'))
    parts.push('')
  }

  parts.push('【用户引用】')
  parts.push(body)
  parts.push('')
  parts.push('【用户问题】')
  parts.push(q)

  return parts.join('\n')
}