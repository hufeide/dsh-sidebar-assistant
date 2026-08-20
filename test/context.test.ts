import { describe, it, expect } from 'vitest'
import { clampQuoted, buildSystemPrompt, buildUserMessage } from '../src/host/context.js'

describe('clampQuoted', () => {
  it('超长时截断并保留前段', () => {
    const out = clampQuoted('a'.repeat(100), 10)
    expect(out.length).toBeLessThanOrEqual(20)
    expect(out.startsWith('a'.repeat(10))).toBe(true)
  })
  it('短文本不改变', () => {
    expect(clampQuoted('  hi  ', 100)).toBe('hi')
  })
  it('maxChars<=0 时不截断', () => {
    expect(clampQuoted('hello', 0)).toBe('hello')
  })
})

describe('buildSystemPrompt', () => {
  it('无参数时给出默认助手', () => {
    expect(buildSystemPrompt('', '')).toContain('问答助手')
  })
  it('包含用户目录与系统提示两者', () => {
    const out = buildSystemPrompt('你是AI', '我叫小明')
    expect(out).toContain('我叫小明')
    expect(out).toContain('你是AI')
    expect(out).toContain('用户目录')
    expect(out).toContain('系统提示')
  })
  it('仅 persona 时只含用户目录', () => {
    const out = buildSystemPrompt('', '归档背景')
    expect(out).toContain('归档背景')
    expect(out).not.toContain('系统提示')
  })
})

describe('buildUserMessage', () => {
  it('问题与引用都被包含', () => {
    const out = buildUserMessage('选中文字', '说明什么')
    expect(out).toContain('选中文字')
    expect(out).toContain('说明什么')
    expect(out).toContain('用户引用')
  })
  it('没有引用时给占位', () => {
    expect(buildUserMessage('', 'Q')).toContain('未提供引用文字')
  })
})