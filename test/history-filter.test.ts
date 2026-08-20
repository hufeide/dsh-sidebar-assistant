import { describe, it, expect } from 'vitest'
import { filterTurnsByQuote, isTurnMatchingQuote } from '../src/client/history-filter.js'
import type { TurnLike } from '../src/client/history-filter.js'

describe('isTurnMatchingQuote', () => {
  it('空引用不命中', () => {
    expect(isTurnMatchingQuote({ role: 'assistant', text: 'hello' }, '  ')).toBe(false)
  })
  it('空 turn 文本不命中', () => {
    expect(isTurnMatchingQuote({ role: 'user', text: '   ' }, 'foo')).toBe(false)
  })
  it('turn 文本包含引用 -> 命中', () => {
    expect(isTurnMatchingQuote({ role: 'assistant', text: 'foo bar baz' }, 'bar')).toBe(true)
  })
  it('"引用包含 turn 文本"方向 不算命中（避免误伤子串短消息）', () => {
    // turn "hi" 是 "say hi there" 的子串，但反过来 turn 不包含整个引用。
    expect(isTurnMatchingQuote({ role: 'user', text: 'hi' }, 'say hi there')).toBe(false)
  })
  it('大小写 / 首尾空白忽略', () => {
    expect(isTurnMatchingQuote({ role: 'assistant', text: 'Hello World' }, '  hello ')).toBe(true)
  })
  it('完全不沾边 -> 不命中', () => {
    expect(isTurnMatchingQuote({ role: 'assistant', text: 'abc' }, 'xyz')).toBe(false)
  })
})

describe('filterTurnsByQuote', () => {
  // 模拟一段常见对话：4 个 round
  const turns: TurnLike[] = [
    { role: 'user',      text: '什么是 RAG？' },
    { role: 'assistant', text: 'RAG 是检索增强生成，先检索相关文档再交给大模型。' },
    { role: 'user',      text: '它和微调有什么区别？' },
    { role: 'assistant', text: '微调改模型权重，RAG 改上下文注入。' },
    { role: 'user',      text: '那我应该用哪种？' },
    { role: 'assistant', text: '看场景：知识经常变就用 RAG。' },
  ]

  it('空引用返回空', () => {
    expect(filterTurnsByQuote(turns, '')).toEqual([])
    expect(filterTurnsByQuote(turns, '   ')).toEqual([])
  })

  it('空 turns 返回空', () => {
    expect(filterTurnsByQuote([], 'foo')).toEqual([])
  })

  it('多处命中（RAG 在 4 个 turn 里出现）：所有命中 turn 与各自伙伴都保留，按原顺序', () => {
    // 命中 turn 0/1/3/5（均含"RAG"），按配对规则这些 turn 互相牵出
    // turn 0(前 user) & 1(后 assistant)、3(前 user) & 5(前 user) 等，
    // 所有 6 条都被保留。
    const out = filterTurnsByQuote(turns, 'RAG')
    expect(out.map((t) => t.text)).toEqual([
      '什么是 RAG？',
      'RAG 是检索增强生成，先检索相关文档再交给大模型。',
      '它和微调有什么区别？',
      '微调改模型权重，RAG 改上下文注入。',
      '那我应该用哪种？',
      '看场景：知识经常变就用 RAG。',
    ])
  })

  it('同一主题但只命中 user：连同其紧邻 assistant 一并保留', () => {
    // 仅 turn 2 含 "微调区别"，命中 user 后向前找最近 assistant 找不到，
    // 向后找下一个 assistant（turn 3）也被命中 → 实际输出 [2,3]。
    const out = filterTurnsByQuote(turns, '微调有什么区别')
    expect(out.map((t) => t.text)).toEqual([
      '它和微调有什么区别？',
      '微调改模型权重，RAG 改上下文注入。',
    ])
  })

  it('引用命中 assistant：保留 assistant 与其前一条 user', () => {
    const out = filterTurnsByQuote(turns, '检索增强')
    expect(out.map((t) => t.text)).toEqual([
      '什么是 RAG？',
      'RAG 是检索增强生成，先检索相关文档再交给大模型。',
    ])
  })

  it('完全无命中返回空数组', () => {
    expect(filterTurnsByQuote(turns, '量子纠缠')).toEqual([])
  })

  it('保留原顺序并去重', () => {
    // 选中文本同时出现在两个不连续的 turn 中；配对不应重复。
    const local: TurnLike[] = [
      { role: 'user',      text: 'a' },
      { role: 'assistant', text: 'b' },
      { role: 'user',      text: 'c' },
      { role: 'assistant', text: 'a' }, // 又出现 'a'
    ]
    const out = filterTurnsByQuote(local, 'a')
    // 命中位置 0(forward->assistant 1), 3(backward->user 2)，且 0、1、2、3 全部被保留
    expect(out.map((t) => t.text)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('一个 assistant 没有前置 user 时不会越界崩', () => {
    const local: TurnLike[] = [
      { role: 'assistant', text: 'hi there' },
      { role: 'user', text: '?' },
    ]
    const out = filterTurnsByQuote(local, 'hi there')
    expect(out.map((t) => t.text)).toEqual(['hi there'])
  })

  it('最末尾 user 命中时不会向后越界', () => {
    const local: TurnLike[] = [
      { role: 'user', text: 'foo' },
      { role: 'assistant', text: 'bar' },
      { role: 'user', text: 'foo again' },
    ]
    const out = filterTurnsByQuote(local, 'foo again')
    // 仅命中末尾 user，没有后置 partner → 只输出它本身
    expect(out.map((t) => t.text)).toEqual(['foo again'])
  })

  it('system / context 节点存在时也按 user 类配对到其后 assistant', () => {
    const local: TurnLike[] = [
      { role: 'system',    text: '你是一名助手' },
      { role: 'user',      text: '介绍一下 transform' },
      { role: 'assistant', text: 'transform 是一种注意力机制。' },
      { role: 'assistant', text: '关于 transform 的更多细节...' }, // 双 assistant 紧挨（续答）
    ]
    const out = filterTurnsByQuote(local, '注意力机制')
    // 命中第三个 turn；向前找最近 user 类 → 第二个；向后找 assistant → 即它本身
    expect(out.map((t) => t.text)).toEqual([
      '介绍一下 transform',
      'transform 是一种注意力机制。',
    ])
  })
})
