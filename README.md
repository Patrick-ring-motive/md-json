# md-json-ai

Lightweight markdown → structured JSON parser. Designed for consuming AI-friendly markdown endpoints (`/index.md`, `llms.txt`, GitHub READMEs) and turning them into clean, navigable APIs — without a server.

Runs in the browser, Cloudflare Workers, and anywhere that speaks JavaScript.

https://docs-api.language-models.workers.dev/workers-ai/platform/pricing/index.md

## Output shape

Headings become object keys. Content nests under them. Mixed sections (content + sub-headings) become arrays where strings, tables, and callouts are plain values and sub-sections are `{"Heading": ...}` entries.

```json
{
  "meta": { "title": "Workers AI Pricing", "description": "..." },
  "Pricing": [
    { "note": "Updated pricing is more granular." },
    "Workers AI is priced at $0.011 per 1,000 Neurons.",
    { "Custom requirements": "Complete the form for higher limits." },
    { "LLM model pricing": [
      { "Model": "@cf/meta/llama-3.2-1b-instruct", "Price in Tokens": ["$0.027 per M input tokens", "$0.201 per M output tokens"] }
    ]}
  ]
}
```

**Tables** → array of objects (or 2D array if no headers).  
**Lists** → plain string array.  
**Code blocks** → `{ code, lang }` — JSON blocks also get a `parsed` key.  
**Callouts** → `{ note: "..." }`, `{ warning: "..." }`, etc.  
**Leaf strings that are valid JSON** → parsed in place.  
**Nav chrome** (Skip to content, Edit page, Was this helpful?) → stripped automatically.

## Parser

Built on [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown) + [`micromark-extension-gfm`](https://github.com/micromark/micromark-extension-gfm) — the same CommonMark-compliant core that powers the `unified`/`remark` ecosystem. ~37KB gzipped with GFM support.

## Usage

```js
import { parseMarkdown } from './parser.js'

const json = parseMarkdown(markdownString)
```

Or fetch a doc’s `.md` endpoint directly:

```js
const md = await fetch('https://developers.cloudflare.com/workers-ai/platform/pricing/index.md').then(r => r.text())
const json = parseMarkdown(md)
```

### Cloudflare Worker

```js
import { parseMarkdown } from './parser.js'

export default {
  async fetch(req) {
    const url = new URL(req.url)
    const target = url.searchParams.get('url')
    if (!target) return new Response('?url= required', { status: 400 })

    const md = await fetch(target).then(r => r.text())
    const json = parseMarkdown(md)

    return new Response(JSON.stringify(json, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
}
```

## Handling real-world docs

Sites increasingly publish markdown for AI consumption but render it server-side first, baking in nav chrome. The parser handles this with a pre-pass that strips known patterns before handing off to mdast:

- `[Skip to content]`, `Was this helpful?`, `YesNo`
- `[ Edit](url) [ Issue](url)` nav link lines
- `## Was this helpful?` headings
- `Copy page`

New patterns are easy to add to `stripCruft()`.

## Caveats

- **Multi-value table cells** (separated by 2+ spaces, common in CF docs) become arrays
- **Blank table header columns** are merged into the previous named header
- **Bold-only paragraphs** (`**Title**`) followed by a body paragraph are treated as informal callouts: `{ "Title": "body text" }`
- Frontmatter goes into `meta` and is excluded from section keys

## Demo

Open [`demo`](https://patrick-ring-motive.github.io/md-json-ai/) — live editor with collapsible JSON tree and copy button.

## License

MIT
