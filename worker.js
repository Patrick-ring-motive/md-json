// worker.js — md-json Cloudflare Worker
// Fetches /{path} from developers.cloudflare.com as markdown and returns parsed JSON.
//
// Usage:
//   GET /workers-ai/models/index.md       → JSON
//   GET /workers-ai/platform/pricing      → JSON (appends /index.md if no .md ext)
//
// Deploy:
//   npx wrangler deploy worker.js --name md-json --compatibility-date 2025-01-01

import { parseMarkdown } from './parser.js'

const CF_DOCS_BASE = 'https://developers.cloudflare.com'

function mdPath(pathname) {
  // already ends in .md → use as-is
  if (pathname.endsWith('.md')) return pathname
  // strip trailing slash, append /index.md
  return pathname.replace(/\/$/, '') + '/index.md'
}

export default {
  async fetch(req) {
    const url = new URL(req.url)

    // Health check
    if (url.pathname === '/') {
      return new Response(JSON.stringify({
        name: 'md-json',
        usage: '/{cloudflare-docs-path}',
        example: '/workers-ai/platform/pricing/index.md',
      }, null, 2), {
        headers: corsJson(),
      })
    }

    const target = CF_DOCS_BASE + mdPath(url.pathname)

    let md
    try {
      const res = await fetch(target)
      if (!res.ok) {
        return errResponse(res.status, `Upstream returned ${res.status} for ${target}`)
      }
      md = await res.text()
    } catch (e) {
      return errResponse(502, `Failed to fetch ${target}: ${e.message}`)
    }

    let parsed
    try {
      parsed = parseMarkdown(md)
    } catch (e) {
      return errResponse(500, `Parse error: ${e.message}`)
    }

    return new Response(JSON.stringify(parsed, null, 2), {
      headers: corsJson(),
    })
  }
}

function corsJson() {
  return {
    'Content-Type': 'application/json;charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  }
}

function errResponse(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: corsJson(),
  })
}
