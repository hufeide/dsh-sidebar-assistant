/* (c) 2026 dsh-sidehelper - 按 SessionId 分桶持久化（baseDir 可注入，可单测） */

import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { AnswerRecord } from '../types/index.js'

/** 将任意 sessionId 归一化为安全的文件名片段 */
export function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 128)
}

export class Persistence {
  constructor(private readonly baseDir: string) {}

  private fileFor(sessionId: string): string {
    return path.join(this.baseDir, `${safeId(sessionId)}.json`)
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  async append(rec: AnswerRecord): Promise<AnswerRecord> {
    await this.ensureDir()
    const file = this.fileFor(rec.sessionId)
    const list = await this.list(rec.sessionId)
    list.push(rec)
    await fs.writeFile(file, JSON.stringify(list, null, 2), 'utf8')
    return rec
  }

  async list(sessionId: string): Promise<AnswerRecord[]> {
    const file = this.fileFor(sessionId)
    try {
      const raw = await fs.readFile(file, 'utf8')
      const arr: unknown = JSON.parse(raw)
      return Array.isArray(arr) ? (arr as AnswerRecord[]) : []
    } catch {
      return []
    }
  }

  async all(): Promise<AnswerRecord[]> {
    await this.ensureDir()
    const names = await fs.readdir(this.baseDir)
    const out: AnswerRecord[] = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      try {
        const arr: unknown = JSON.parse(await fs.readFile(path.join(this.baseDir, name), 'utf8'))
        if (Array.isArray(arr)) out.push(...(arr as AnswerRecord[]))
      } catch {
        /* 跳过损坏文件 */
      }
    }
    return out.sort((a, b) => a.createdAt - b.createdAt)
  }
}