#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync
} from 'node:fs'

const file = process.argv[2] || 'parser.dist.js'
let src = readFileSync(file, 'utf8')

src = src.replaceAll('value && typeof value === "object"', 'isObject(value)')
src = src.replaceAll('typeof value === "string"', 'isString(value)')

writeFileSync(file, src)
console.log(`Patched ${file}`)
