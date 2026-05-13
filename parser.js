import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'

// ── NAV CRUFT STRIPPER ────────────────────────────────────────────────────────
// Removes rendered-nav lines baked into fetched .md docs before parsing.

const isArray = x => Array.isArray(x) || x instanceof Array
const isObject = x => x !== null && typeof x === 'object'
const isString = x => x instanceof String || typeof x === 'string'

const NAV_EXACT = new Set(['yesno', 'copy page', 'copy'])
const NAV_RE = [
  /^\[skip to content\]/i,
  /^was this helpful\?/i,
  /^#{1,6}\s+was this helpful\?/i,
  /^\[\s*(edit\b.*|report issue|copy page)\s*\]/i,
  /^\[\s*↗?\s*\]$/,
  // lines consisting only of nav links e.g. "[ Edit](url) [ Issue](url)"
  /^(\[\s*[^\]]*\]\([^)]+\)\s*)+$/,
]

function stripCruft(text) {
  const lines = text.split('\n')
  const out = []
  let pastFirstHeading = false
  for (const line of lines) {
    const l = line.trim()
    if (/^#{1,6}\s/.test(l)) pastFirstHeading = true
    if (!pastFirstHeading) {
      if (!l) continue
      if (NAV_EXACT.has(l.toLowerCase())) continue
      if (NAV_RE.some(r => r.test(l))) continue
    }
    out.push(line)
  }
  return out.join('\n')
}

// ── INLINE TEXT EXTRACTION ────────────────────────────────────────────────────

function inlineText(nodes) {
  if (!nodes) return ''
  return nodes.map(n => {
    if (n.type === 'text' || n.type === 'inlineCode') return n.value
    if (n.type === 'link') return inlineText(n.children).replace(/\s*↗\s*$/, '')
    if (n.children) return inlineText(n.children)
    return ''
  }).join('').trim()
}

// ── TABLE NODE → array of objects (or 2D array if no headers) ────────────────

function cellValue(text) {
  const parts = text.split(/  +/).map(s => s.trim()).filter(Boolean)
  return parts.length > 1 ? parts : text
}

function convertTable(node) {
  const rows = node.children
  if (!rows.length) return []

  const headerRow = rows[0].children.map(cell => inlineText(cell.children))
  const hasHeaders = headerRow.some(h => h !== '')

  if (!hasHeaders) {
    return rows.map(row => row.children.map(cell => cellValue(inlineText(cell.children))))
  }

  return rows.slice(1).map(row => {
    const obj = {}
    row.children.forEach((cell, i) => {
      const header = headerRow[i] ?? ''
      if (!header) return
      obj[header] = cellValue(inlineText(cell.children))
    })
    return obj
  })
}

// ── PARAGRAPH CLASSIFICATION ──────────────────────────────────────────────────

const CALLOUT_KEYWORDS = new Set(['note', 'warning', 'tip', 'info', 'caution'])

function classifyParagraph(node) {
  const children = node.children

  // "Note\nBody text" — single text node whose first line is a callout keyword
  if (children.length === 1 && children[0].type === 'text') {
    const lines = children[0].value.split('\n')
    if (lines.length >= 2 && CALLOUT_KEYWORDS.has(lines[0].trim().toLowerCase())) {
      return {
        type: 'callout',
        key: lines[0].trim().toLowerCase(),
        value: lines.slice(1).join(' ').trim(),
      }
    }
  }

  // **Bold only** paragraph → informal callout; walker consumes next sibling as body
  if (children.length === 1 && children[0].type === 'strong') {
    const text = inlineText(children[0].children)
    if (text) return { type: 'boldCallout', key: text }
  }

  return { type: 'paragraph', value: inlineText(children) }
}

// ── MDAST WALKER → flat-key JSON ──────────────────────────────────────────────

function hoistItem(item) {
  if (isObject(item) && !isArray(item)) {
    const keys = Object.keys(item)
    if (keys.length === 1 && (keys[0] === 'table' || keys[0] === 'list')) return item[keys[0]]
  }
  return item
}

function resolve(items) {
  if (!items.length) return null
  if (items.length === 1) return hoistItem(items[0])
  return items.map(hoistItem)
}

function walk(nodes) {
  const stack = [{ level: 0, key: null, items: [] }]

  function current() { return stack[stack.length - 1] }
  function push(item) { current().items.push(item) }

  function popTo(targetLevel) {
    while (stack.length > 1 && stack[stack.length - 1].level >= targetLevel) {
      const finished = stack.pop()
      current().items.push({ [finished.key]: resolve(finished.items) })
    }
  }

  let i = 0
  while (i < nodes.length) {
    const node = nodes[i]

    if (node.type === 'heading') {
      popTo(node.depth)
      stack.push({ level: node.depth, key: inlineText(node.children), items: [] })
      i++; continue
    }

    if (node.type === 'table') {
      push({ table: convertTable(node) })
      i++; continue
    }

    if (node.type === 'code') {
      const block = { code: node.value }
      if (node.lang) block.lang = node.lang
      if (node.lang === 'json') { try { block.parsed = JSON.parse(node.value) } catch (_) {} }
      push(block)
      i++; continue
    }

    if (node.type === 'blockquote') {
      push({ note: node.children.map(c => inlineText(c.children)).join(' ') })
      i++; continue
    }

    if (node.type === 'list') {
      const items = node.children.map(li => {
        const parts = []
        for (const child of li.children) {
          if (child.type === 'list') {
            parts.push(child.children.map(sli =>
              inlineText(sli.children.flatMap(c => c.children || [c]))
            ))
          } else {
            parts.push(inlineText(child.children))
          }
        }
        return parts.length === 1 ? parts[0] : parts
      })
      push({ list: items })
      i++; continue
    }

    if (node.type === 'thematicBreak' || node.type === 'html') {
      i++; continue
    }

    if (node.type === 'paragraph') {
      const classified = classifyParagraph(node)

      if (classified.type === 'callout') {
        push({ [classified.key]: classified.value })
        i++; continue
      }

      if (classified.type === 'boldCallout') {
        const next = nodes[i + 1]
        if (next?.type === 'paragraph') {
          push({ [classified.key]: inlineText(next.children) })
          i += 2; continue
        } else {
          push(inlineText(node.children))
          i++; continue
        }
      }

      if (classified.value) push(classified.value)
      i++; continue
    }

    i++
  }

  popTo(0)
  return stack[0].items
}

// ── LEAF JSON PARSING ─────────────────────────────────────────────────────────

function tryJson(str) {
  const t = str.trimStart()
  if (t[0] !== '{' && t[0] !== '['){
    if(!t.includes('•'))return str
    return t.split('•').map(x=>x.trim()).filter(Boolean);
  }
  try { return JSON.parse(str) } catch (_) { return str }
}

function tryParseLeaves(obj) {
  if (isArray(obj)) {
    const obj_length = obj.length
    for (let i = 0; i !== obj_length; ++i) {
      const v = obj[i]
      if (isString(v)) { const p = tryJson(v); if (p !== v) obj[i] = p }
      else if (isObject(v)) tryParseLeaves(v)
    }
  } else if (isObject(obj)) {
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (isString(v)) { const p = tryJson(v); if (p !== v) obj[k] = p }
      else if (isObject(v)) tryParseLeaves(v)
    }
  }
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

/**
 * Parse a markdown string into a structured JSON object.
 *
 * Headings become object keys. Content nests under them.
 * Mixed sections (content + sub-headings) become arrays.
 *
 * @param {string} markdown
 * @returns {object}
 */
export function parseMarkdown(markdown) {
  markdown = stripCruft(markdown)

  let meta = null
  const fmMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (fmMatch) {
    meta = {}
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^([\w-]+):\s*(.+)/)
      if (kv) meta[kv[1]] = kv[2].trim()
    }
    markdown = markdown.slice(fmMatch[0].length)
  }

  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  })

  const result = {}
  if (meta) result.meta = meta

  const items = walk(tree.children)
  for (const item of items) {
    if (isObject(item) && !isArray(item)) {
      Object.assign(result, item)
    }
  }

  tryParseLeaves(result)
  return result
}
