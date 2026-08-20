/* (c) 2026 dsh-sidehelper */

export interface SideHelperConfig {
  enabled: boolean
  provider: string
  model: string
  systemPrompt: string
  personaText: string
  persistDir: string
  maxQuotedChars: number
  placeholder: string
}

export interface HistoryMessage {
  /** 消息角色：'user' / 'assistant' / 'system'（system = context 注入） */
  role: 'user' | 'assistant' | 'system'
  text: string
}

export interface AskRequest {
  /** 主会话 sessionId（用于隔离 & 回看） */
  sessionId: string
  /** 选中的文字 */
  quoted: string
  /** 用户问题 */
  question: string
  /** 选中所处会话的历史消息（已过滤其他会话），按时间正序；空数组表示无历史。 */
  history?: HistoryMessage[]
}

export interface AnswerRecord {
  id: string
  sessionId: string
  createdAt: number
  quoted: string
  question: string
  answer: string
  model?: string
}