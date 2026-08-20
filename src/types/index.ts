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
  /** 当前会话未过滤的 turn 总条数（仅用于诊断 / UI 提示，可选）。 */
  totalTurns?: number
}

/** host → client 的 diagnostics payload：客户端在面板 UI 上展示「过滤后上下文」用了哪几轮。 */
export interface HistoryDiagnostics {
  totalTurns: number
  keptTurns: number
  quotedChars: number
  quotedPreview: string
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