import {
  describe,
  it
} from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMarkdown
} from './parser.js'

describe('parseMarkdown', () => {
  it('parses a simple heading + paragraph', () => {
    const result = parseMarkdown('# Hello\n\nWorld')
    assert.deepStrictEqual(result, {
      Hello: 'World'
    })
  })

  it('parses frontmatter into meta', () => {
    const md = '---\ntitle: Test\ndescription: A test doc\n---\n\n# Intro\n\nHello'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result.meta, {
      title: 'Test',
      description: 'A test doc'
    })
    assert.strictEqual(result.Intro, 'Hello')
  })

  it('parses nested headings', () => {
    const md = '# Top\n\n## Sub\n\nContent'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result, {
      Top: {
        Sub: 'Content'
      }
    })
  })

  it('parses lists', () => {
    const md = '# Items\n\n- one\n- two\n- three'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result, {
      Items: ['one', 'two', 'three']
    })
  })

  it('parses tables', () => {
    const md = '# Data\n\n| Name | Value |\n|------|-------|\n| a    | 1     |\n| b    | 2     |'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result, {
      Data: [{
          Name: 'a',
          Value: '1'
        },
        {
          Name: 'b',
          Value: '2'
        },
      ]
    })
  })

  it('parses code blocks', () => {
    const md = '# Example\n\n```js\nconsole.log("hi")\n```'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result, {
      Example: {
        code: 'console.log("hi")',
        lang: 'js'
      }
    })
  })

  it('strips nav cruft before first heading', () => {
    const md = '[Skip to content](#main)\n\nYesNo\n\n# Title\n\nBody'
    const result = parseMarkdown(md)
    assert.strictEqual(result.Title, 'Body')
    assert.strictEqual(Object.keys(result).length, 1)
  })

  it('returns empty object for empty input', () => {
    const result = parseMarkdown('')
    assert.deepStrictEqual(result, {})
  })

  it('collapses arrays of objects with mutually exclusive keys', () => {
    const md = '# Section\n\n## A\n\nfoo\n\n## B\n\nbar\n\n## C\n\nbaz'
    const result = parseMarkdown(md)
    assert.deepStrictEqual(result, {
      Section: {
        A: 'foo',
        B: 'bar',
        C: 'baz'
      }
    })
  })

  it('preserves arrays when objects share keys', () => {
    const md = '# Items\n\n| Name | Value |\n|------|-------|\n| a | 1 |\n| b | 2 |'
    const result = parseMarkdown(md)
    // table rows share keys, so they stay as an array
    assert.ok(Array.isArray(result.Items))
  })
})
