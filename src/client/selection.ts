/* (c) 2026 dsh-sidehelper - Client 选择监听 + 「提问」浮钮（DOM 自包含） */

export interface SelectionInfo {
  text: string
  rect: { x: number; y: number; w: number; h: number }
}

export interface AskFlow {
  (quoted: string, rect: SelectionInfo['rect']): void
}

/** 监听会话区域(host)内的文字选择；选中非空文字时在选区下方显示「提问」浮钮。 */
export function createSelectionWatcher(
  doc: Document,
  host: HTMLElement,
  onClick: AskFlow,
): { start(): void; stop(): void } {
  let btn: HTMLButtonElement | null = null
  let rect: SelectionInfo['rect'] = { x: 0, y: 0, w: 0, h: 0 }

  function hide(): void {
    if (btn) btn.style.display = 'none'
  }

  function show(): void {
    if (!btn) return
    btn.style.display = 'block'
    btn.style.left = `${Math.max(4, rect.x + rect.w / 2)}px`
    btn.style.top = `${Math.max(4, rect.y + rect.h + 6)}px`
  }

  function onSelection(): void {
    const sel = doc.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hide()
      return
    }
    const range = sel.getRangeAt(0).getBoundingClientRect()
    if (range.width === 0 && range.height === 0) {
      hide()
      return
    }
    rect = { x: range.left, y: range.top, w: range.width, h: range.height }
    show()
  }

  function ensureBtn(): HTMLButtonElement {
    if (btn) return btn
    btn = doc.createElement('button')
    btn.id = 'dsh-sidehelper-ask-btn'
    btn.type = 'button'
    btn.textContent = '提问'
    btn.style.cssText =
      'position:fixed;z-index:2147483000;display:none;padding:4px 10px;font-size:13px;' +
      'border:1px solid #8882;border-radius:6px;background:#f5f6f8;color:#111;cursor:pointer;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.15);transform:translateX(-50%);'
    btn.addEventListener('click', () => {
      hide()
      const text = doc.getSelection()?.toString().trim() ?? ''
      onClick(text || (btn?.dataset.sel ?? ''), rect)
    })
    doc.body.appendChild(btn)
    return btn
  }

  function start(): void {
    ensureBtn()
    host.addEventListener('mouseup', onSelection)
    doc.addEventListener('selectionchange', onSelection)
    doc.addEventListener('mousedown', (e) => {
      if (e.target instanceof Node && e.target !== btn && !btn?.contains(e.target)) hide()
    })
  }

  function stop(): void {
    host.removeEventListener('mouseup', onSelection)
    doc.removeEventListener('selectionchange', onSelection)
    btn?.remove()
    btn = null
  }

  return { start, stop }
}