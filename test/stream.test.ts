import { describe, it, expect } from 'vitest'
import { collectText, fromStrings } from '../src/host/stream.js'
import type { TextDelta } from '../src/host/stream.js'

describe('collectText', () => {
  it('拼接增量', async () => {
    expect(await collectText(fromStrings(['你', '好', '世界']))).toBe('你好世界')
  })
  it('空流返回空串', async () => {
    expect(await collectText(fromStrings([]))).toBe('')
  })
  it('跳过无 delta 的段', async () => {
    async function* source(): AsyncIterable<TextDelta> {
      yield { delta: 'a' }
      yield {} as TextDelta
      yield { delta: 'b' }
    }
    expect(await collectText(source())).toBe('ab')
  })
})