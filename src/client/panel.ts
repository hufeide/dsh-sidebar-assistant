/* (c) 2026 dsh-sidehelper - 浮层问答窗口（DOM 自包含） */

export interface PanelOptions {
  placeholder?: string
}

/** 流片段：与 host 端的 SSE 事件保持一致。 */
export interface StreamPiece {
  type: 'delta' | 'think' | 'done' | 'error'
  text?: string
  answer?: string
  error?: string
}

export interface AskStream {
  (question: string, onPiece: (p: StreamPiece) => void): Promise<void>
}

export interface QuestionPanel {
  open(quoted: string, ask: AskStream): void
  close(): void
  dispose(): void
}

/** 创建浮层问答面板：选中文字预览 + 输入框 + 回答区。 */
export function createQuestionPanel(opts: PanelOptions = {}): QuestionPanel {
  const doc = document
  const root = doc.createElement('div')
  const quote = doc.createElement('div')
  const input = doc.createElement('textarea')
  const submit = doc.createElement('button')
  const answer = doc.createElement('div')
  const questionEl = doc.createElement('div')
  const closeBtn = doc.createElement('button')
  // 「思考过程」可折叠容器（默认折叠）
  const thinkWrap = doc.createElement('details')
  const thinkSummary = doc.createElement('summary')
  const thinkBody = doc.createElement('div')
  thinkWrap.appendChild(thinkSummary)
  thinkWrap.appendChild(thinkBody)
  thinkWrap.open = false

  // root 用 JS 显式设置 width/height（resize 需要），初始值 = 视口相关比例
  const initialW = Math.min(560, Math.max(360, doc.defaultView!.innerWidth - 64))
  const initialH = Math.min(560, Math.max(360, doc.defaultView!.innerHeight - 64))
  Object.assign(root.style, {
    position: 'fixed', left: '24px', top: '24px',
    width: initialW + 'px', height: initialH + 'px', zIndex: '2147483001',
    background: '#fff', color: '#111', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,.25)',
    padding: '0', fontFamily: 'system-ui, sans-serif', fontSize: '14px',
    border: '1px solid #e5e7eb', boxSizing: 'border-box', overflow: 'hidden',
    display: 'none', flexDirection: 'column',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(quote.style, {
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f4f6f8',
    padding: '8px', borderRadius: '6px', maxHeight: '120px', overflow: 'auto',
    color: '#555', fontSize: '13px', marginBottom: '8px',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(closeBtn.style, {
    float: 'right', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(input.style, {
    width: '100%', boxSizing: 'border-box', margin: '6px 0', padding: '8px', border: '1px solid #ccc',
    borderRadius: '6px', minHeight: '60px', fontSize: '14px', resize: 'vertical',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(submit.style, {
    padding: '6px 14px', border: 'none', borderRadius: '6px', background: '#2563eb', color: '#fff',
    cursor: 'pointer', fontSize: '14px',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(answer.style, {
    whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '6px', lineHeight: '1.65',
    padding: '12px 14px', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: '8px',
    maxHeight: '28vh', overflowY: 'auto', overflowX: 'hidden', minHeight: '1.65em',
  } as Partial<CSSStyleDeclaration>)

  Object.assign(thinkWrap.style, {
    marginTop: '8px', padding: '0', background: '#fff7ed', border: '1px solid #fed7aa',
    borderRadius: '8px', fontSize: '13px', color: '#7c2d12', overflow: 'hidden',
  } as Partial<CSSStyleDeclaration>)
  thinkSummary.textContent = '思考过程'
  Object.assign(thinkSummary.style, {
    padding: '8px 12px', cursor: 'pointer', fontWeight: '600', userSelect: 'none',
    background: '#fff7ed', listStyle: 'none',
  } as Partial<CSSStyleDeclaration>)
  Object.assign(thinkBody.style, {
    padding: '10px 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: '18vh', overflowY: 'auto', borderTop: '1px solid #fed7aa',
    lineHeight: '1.6', background: '#fffaf2',
  } as Partial<CSSStyleDeclaration>)

  Object.assign(questionEl.style, {
    display: 'none', marginTop: '10px', padding: '10px 14px', background: '#eff6ff',
    border: '1px solid #dbeafe', borderRadius: '8px', fontSize: '13px', color: '#1e3a8a',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  } as Partial<CSSStyleDeclaration>)
  const questionLabel = doc.createElement('div')
  questionLabel.textContent = '你的问题'
  Object.assign(questionLabel.style, { fontWeight: '600', marginBottom: '4px', fontSize: '12px', opacity: '.7' } as Partial<CSSStyleDeclaration>)
  questionEl.insertBefore(questionLabel, questionEl.firstChild)

  const title = doc.createElement('div')
  title.textContent = '「选中即问」'
  Object.assign(title.style, { fontWeight: '600', cursor: 'grab', userSelect: 'none', flex: '1 1 auto' } as Partial<CSSStyleDeclaration>)
  closeBtn.textContent = '×'
  submit.textContent = '提问'

  const header = doc.createElement('div')
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px',
    borderBottom: '1px solid #f0f2f5', cursor: 'grab', userSelect: 'none',
    background: '#fbfcfe', borderTopLeftRadius: '10px', borderTopRightRadius: '10px',
  } as Partial<CSSStyleDeclaration>)
  header.appendChild(title)
  header.appendChild(closeBtn)

  // 内容区（撑满 root 剩余高度，可滚动）
  const body = doc.createElement('div')
  Object.assign(body.style, {
    padding: '12px 14px', overflowY: 'auto', flex: '1 1 auto', minHeight: '0',
    boxSizing: 'border-box',
  } as Partial<CSSStyleDeclaration>)

  body.appendChild(quote)
  body.appendChild(input)
  body.appendChild(submit)
  body.appendChild(questionEl)
  body.appendChild(thinkWrap)
  body.appendChild(answer)
  root.appendChild(header)
  root.appendChild(body)

  // 8 个 resize handle（4 角 + 4 边）。所有 handle 父级是 root，absolute 贴边。
  type Direction = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  const cursorByDir: Record<Direction, string> = {
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
    ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
  }
  const handles: { dir: Direction; el: HTMLDivElement }[] = []
  const handleSize = 8 // 角上是 8x8，边上厚度 8，长度沿边
  const makeHandle = (dir: Direction): HTMLDivElement => {
    const el = doc.createElement('div')
    el.dataset['resize'] = dir
    Object.assign(el.style, {
      position: 'absolute', zIndex: '2',
      ...(dir === 'n' || dir === 's'
        ? { left: '0', right: '0', height: handleSize + 'px' }
        : dir === 'e' || dir === 'w'
          ? { top: '0', bottom: '0', width: handleSize + 'px' }
          : { width: handleSize + 'px', height: handleSize + 'px' }),
    } as Partial<CSSStyleDeclaration>)
    if (dir === 'n') { el.style.top = '0' }
    else if (dir === 's') { el.style.bottom = '0' }
    else if (dir === 'e') { el.style.right = '0' }
    else if (dir === 'w') { el.style.left = '0' }
    else if (dir === 'ne') { el.style.top = '0'; el.style.right = '0' }
    else if (dir === 'nw') { el.style.top = '0'; el.style.left = '0' }
    else if (dir === 'se') { el.style.bottom = '0'; el.style.right = '0' }
    else if (dir === 'sw') { el.style.bottom = '0'; el.style.left = '0' }
    el.style.cursor = cursorByDir[dir]
    root.appendChild(el)
    handles.push({ dir, el })
    return el
  }
  // 四边
  makeHandle('n'); makeHandle('s'); makeHandle('e'); makeHandle('w')
  // 四角
  makeHandle('ne'); makeHandle('nw'); makeHandle('se'); makeHandle('sw')

  doc.body.appendChild(root)

  let askFn: AskStream | null = null

  function close(): void {
    root.style.display = 'none'
    askFn = null
  }

  function open(quotedText: string, ask: AskStream): void {
    quote.textContent = quotedText || '（未提供引用）'
    answer.textContent = ''
    thinkBody.textContent = ''
    thinkWrap.open = false
    thinkWrap.style.display = 'none'
    questionEl.style.display = 'none'
    // 仅保留「你的问题」标签，清空上次内容
    while (questionEl.childNodes.length > 1) questionEl.removeChild(questionEl.lastChild as ChildNode)
    input.value = ''
    askFn = ask
    root.style.display = 'flex'
    input.focus()
  }

  async function submitAsk(): Promise<void> {
    const q = input.value.trim()
    if (!q || !askFn) return
    submit.disabled = true
    submit.textContent = '生成中…'
    answer.textContent = ''
    thinkBody.textContent = ''
    thinkWrap.open = false
    thinkWrap.style.display = 'none'
    // 展示「你的问题」
    while (questionEl.childNodes.length > 1) questionEl.removeChild(questionEl.lastChild as ChildNode)
    const qText = doc.createElement('div')
    qText.textContent = q
    questionEl.appendChild(qText)
    questionEl.style.display = 'block'

    const onPiece = (p: StreamPiece): void => {
      if (p.type === 'delta') {
        answer.textContent += p.text ?? ''
        answer.scrollTop = answer.scrollHeight
      } else if (p.type === 'think') {
        thinkWrap.style.display = 'block'
        thinkBody.textContent += p.text ?? ''
        // 仅当用户已展开时才跟着滚；否则保持折叠态
        if (thinkWrap.open) thinkBody.scrollTop = thinkBody.scrollHeight
      } else if (p.type === 'error') {
        answer.textContent = `出错了：${p.error ?? 'unknown'}`
      }
      // 'done'：由 askFn resolve 触发，无需在此处理
    }

    try {
      await askFn(q, onPiece)
    } catch (err) {
      if (!answer.textContent) {
        answer.textContent = `出错了：${err instanceof Error ? err.message : String(err)}`
      }
    } finally {
      submit.disabled = false
      submit.textContent = '提问'
    }
  }

  submit.addEventListener('click', submitAsk)
  input.addEventListener('keydown', (e) => {
    // 单行输入框：直接按 Enter 即可提交，无需点按钮。
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitAsk()
    }
  })
  closeBtn.addEventListener('click', close)
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.style.display === 'flex') close()
  })

  // 拖拽：以 header 为手柄移动整个浮层（fixed 定位 + left/top）
  let dragging = false
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  header.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement) === closeBtn) return
    dragging = true
    startX = e.clientX
    startY = e.clientY
    originLeft = root.offsetLeft
    originTop = root.offsetTop
    title.style.cursor = 'grabbing'
    header.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  header.addEventListener('pointermove', (e) => {
    if (!dragging) return
    let nx = originLeft + (e.clientX - startX)
    let ny = originTop + (e.clientY - startY)
    nx = Math.max(0, Math.min(nx, doc.defaultView!.innerWidth - root.offsetWidth))
    ny = Math.max(0, Math.min(ny, doc.defaultView!.innerHeight - root.offsetHeight))
    root.style.left = nx + 'px'
    root.style.top = ny + 'px'
  })
  const endDrag = (e: PointerEvent) => {
    if (!dragging) return
    dragging = false
    title.style.cursor = 'grab'
    try { header.releasePointerCapture(e.pointerId) } catch { /* noop */ }
  }
  header.addEventListener('pointerup', endDrag)
  header.addEventListener('pointercancel', endDrag)

  // 边框拖拽 resize：以 8 个 handle 为锚点，根据方向改变 root 的 width/height 与 left/top。
  const minW = 320, minH = 240
  const maxW = () => Math.max(minW + 20, doc.defaultView!.innerWidth - 20)
  const maxH = () => Math.max(minH + 20, doc.defaultView!.innerHeight - 20)
  let resizing = false
  let rDir: Direction = 'se'
  let rStartX = 0, rStartY = 0
  let rW = 0, rH = 0, rL = 0, rT = 0
  for (const { dir, el } of handles) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation() // 避免冒泡触发 header 拖拽
      resizing = true
      rDir = dir
      rStartX = e.clientX
      rStartY = e.clientY
      rW = root.offsetWidth
      rH = root.offsetHeight
      rL = root.offsetLeft
      rT = root.offsetTop
      el.setPointerCapture(e.pointerId)
    })
    const move = (e: PointerEvent): void => {
      if (!resizing) return
      const dx = e.clientX - rStartX
      const dy = e.clientY - rStartY
      let nw = rW, nh = rH, nl = rL, nt = rT
      if (rDir === 'e' || rDir === 'ne' || rDir === 'se') nw = rW + dx
      if (rDir === 'w' || rDir === 'nw' || rDir === 'sw') { nw = rW - dx; nl = rL + dx }
      if (rDir === 's' || rDir === 'se' || rDir === 'sw') nh = rH + dy
      if (rDir === 'n' || rDir === 'ne' || rDir === 'nw') { nh = rH - dy; nt = rT + dy }
      // 边界约束：最小尺寸 + 不超出视口右上边界
      nw = Math.max(minW, Math.min(nw, maxW()))
      nh = Math.max(minH, Math.min(nh, maxH()))
      nl = Math.max(0, Math.min(nl, doc.defaultView!.innerWidth - nw))
      nt = Math.max(0, Math.min(nt, doc.defaultView!.innerHeight - nh))
      root.style.width = nw + 'px'
      root.style.height = nh + 'px'
      root.style.left = nl + 'px'
      root.style.top = nt + 'px'
    }
    el.addEventListener('pointermove', move)
    const end = (e: PointerEvent): void => {
      if (!resizing) return
      resizing = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  function dispose(): void {
    close()
    root.remove()
  }

  return { open, close, dispose }
}