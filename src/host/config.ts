import Schema from '@deepseek-ai/schemastery'
import type { SideHelperConfig } from '../types/index.js'

export const Config: Schema<SideHelperConfig> = Schema.object({
  enabled: Schema.boolean().default(true),
  provider: Schema.string().default(''),
  model: Schema.string().default(''),
  systemPrompt: Schema.string().default(''),
  personaText: Schema.string().default(''),
  persistDir: Schema.string().default(''),
  maxQuotedChars: Schema.number().default(4000),
  placeholder: Schema.string().default('输入你的问题（所选文字将作为引用）…'),
})
