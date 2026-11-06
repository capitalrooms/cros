#!/usr/bin/env node
// Every email must say which email it is (6 Nov 2026 — the Email hub, lib/email/registry). This check finds every
// buildEmail( and sendEmail( call in app/ and lib/ and fails unless its arguments name a `kind` that's in the registry
// (or, for the hub's own previews, a `theme`). Run by cros-deploy/deploy.sh before anything goes live, so a new email
// can't ship without a place in the hub.   node scripts/check-email-kinds.mjs [--list]
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const registry = readFileSync(join(ROOT, 'lib/email/registry.ts'), 'utf8')
const KINDS = new Set([...registry.matchAll(/key: '([a-z0-9_-]+)'/g)].map(m => m[1]))
const SKIP = new Set(['lib/emailWrapper.ts', 'lib/email/registry.ts'])

function* files(dir) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f.startsWith('.')) continue
    const p = join(dir, f)
    if (statSync(p).isDirectory()) yield* files(p)
    else if (/\.(ts|tsx|mts)$/.test(f)) yield p
  }
}

// the text of a call's arguments, from the "(" — skipping strings, template literals (with ${…}) and comments
function argsFrom(src, i) {
  let depth = 0, j = i
  const stack = []   // inside a template literal's ${ } we count braces
  while (j < src.length) {
    const c = src[j], n = src[j + 1]
    if (c === '/' && n === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j) + 2; continue }
    if (c === '"' || c === "'") { j++; while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; j++ } j++; continue }
    if (c === '`') {
      j++
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '$' && src[j + 1] === '{') {   // an expression inside the template: find its end
          let d = 1; j += 2
          while (j < src.length && d) {
            if (src[j] === '`') { const end = argsFrom(src, j - 1); j = end.end; continue }
            if (src[j] === '{') d++; else if (src[j] === '}') d--
            if (src[j] === '"' || src[j] === "'") { const q = src[j]; j++; while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++ } }
            j++
          }
          continue
        }
        j++
      }
      j++; continue
    }
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth === 0) return { text: src.slice(i, j + 1), end: j + 1 } }
    j++
  }
  return { text: src.slice(i, j), end: j }
}

const problems = [], found = []
for (const f of [...files(join(ROOT, 'app')), ...files(join(ROOT, 'lib'))]) {
  const rel = relative(ROOT, f)
  if (SKIP.has(rel)) continue
  const src = readFileSync(f, 'utf8')
  const ownSend = /function\s+sendEmail\s*\(/.test(src)   // a file's own helper that sends HTML already built (and named) by buildEmail
  for (const m of src.matchAll(/\b(buildEmail|sendEmail|emailHtml)\(/g)) {
    const before = src.slice(Math.max(0, m.index - 30), m.index)
    if (/function\s+$/.test(before)) continue                       // the definition
    if (m[1] === 'sendEmail' && ownSend) continue
    if (m[1] === 'emailHtml' && !/emailHtml[^\n]*from '(@\/lib|\.)\/emailTemplate'|buildEmail as emailHtml/.test(src)) continue   // a local emailHtml, not the wrapper
    const lineStart = src.lastIndexOf('\n', m.index) + 1
    const lineText = src.slice(lineStart, m.index)
    if (/^\s*(\*|\/\/)/.test(lineText) || /(^|\s)\/\/[^'"`]*$/.test(lineText)) continue   // in a comment
    const { text } = argsFrom(src, m.index + m[0].length - 1)
    const line = src.slice(0, m.index).split('\n').length
    const kind = text.match(/\bkind\s*:\s*(['"`])([a-z0-9_-]+)\1/)
    const dynamic = /\bkind\s*:\s*[^'"`\s]/.test(text) || /[{,]\s*kind\s*[,}]/.test(text)   // kind: someVar, or { kind } — not ${kind} in a string
    const preview = /\btheme\s*:/.test(text)
    found.push(`${rel}:${line} ${m[1]} ${kind ? kind[2] : dynamic ? '(from a variable)' : preview ? '(hub preview)' : 'NONE'}`)
    if (kind && !KINDS.has(kind[2])) problems.push(`${rel}:${line} — ${m[1]} names kind '${kind[2]}', which isn't in lib/email/registry.ts`)
    else if (!kind && !dynamic && !preview) problems.push(`${rel}:${line} — ${m[1]} doesn't say which email it is (add kind: '<registry key>')`)
  }
}
if (process.argv.includes('--list')) console.log(found.join('\n'))
if (problems.length) {
  console.error(`STOP — ${problems.length} email${problems.length === 1 ? '' : 's'} without a kind from the Email hub's list:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`emails: all ${found.length} name their kind`)
