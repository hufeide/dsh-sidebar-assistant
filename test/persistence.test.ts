import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Persistence, safeId } from '../src/host/persistence.js'
import type { AnswerRecord } from '../src/types/index.js'

let dir: string
let p: Persistence

function rec(partial: Partial<AnswerRecord> = {}): AnswerRecord {
  return {
    id: 'r1',
    sessionId: 'sess-1',
    createdAt: 1,
    quoted: 'q',
    question: 'Q?',
    answer: 'A',
    ...partial,
  }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sidehelper-'))
  p = new Persistence(dir)
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('safeId', () => {
  it('剥离非法字符', () => {
    expect(safeId('../x y')).toBe('.._x_y')
  })
})

describe('Persistence', () => {
  it('append 后 list 可回读', async () => {
    await p.append(rec())
    const list = await p.list('sess-1')
    expect(list).toHaveLength(1)
    expect(list[0].answer).toBe('A')
  })
  it('不同 sessionId 分桶隔离', async () => {
    await p.append(rec({ sessionId: 'sess-2', id: 'r2', answer: 'B' }))
    expect(await p.list('sess-1')).toHaveLength(1)
    expect(await p.list('sess-2')).toHaveLength(1)
    expect(await p.list('nosuch')).toHaveLength(0)
  })
  it('all() 汇总并按时间升序', async () => {
    await p.append(rec({ sessionId: 'sess-3', id: 'r3', createdAt: 100, answer: 'Z' }))
    await p.append(rec({ sessionId: 'sess-3', id: 'r4', createdAt: 2, answer: 'Y' }))
    const all = await p.all()
    expect(all.map((r) => r.answer)).toEqual(['A', 'B', 'Y', 'Z'])
  })
})