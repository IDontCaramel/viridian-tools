// generates src/catalog/generated.json from the mod's java source
// the mod is the source of truth for field names, types and defaults, so instead of
// hand writing every power type we read the JsonDataType.field/required calls straight
// out of the registration code. anything it can't figure out ends up as a "json" field
// or in the "unresolved" list so it shows up as a warning instead of being guessed
//
// usage: node scripts/generate-catalog.mjs [path/to/re-origin-26.3]

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const modRoot = resolve(process.argv[2] ?? join(here, '../../../re-origin-26.3'))
const javaRoot = join(modRoot, 'src/main/java/net/caramel/viridian')
const outFile = join(here, '../src/catalog/generated.json')

// ---------- source loading ----------

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.java') && !/ \d+\.java$/.test(name)) out.push(p)
  }
  return out
}

// blank out comments but keep offsets and string literals intact
function stripComments(src) {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '"' || c === "'") {
      if (src.startsWith('"""', i)) {
        const end = src.indexOf('"""', i + 3)
        out += src.slice(i, end + 3)
        i = end + 3
        continue
      }
      let j = i + 1
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      out += ' '.repeat(stop - i)
      i = stop
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2) + 2
      out += src.slice(i, end).replace(/[^\n]/g, ' ')
      i = end
    } else {
      out += c
      i++
    }
  }
  return out
}

const files = new Map() // class name -> { name, text, path }
for (const path of walk(javaRoot)) {
  const name = basename(path, '.java')
  files.set(name, { name, path, text: stripComments(readFileSync(path, 'utf8')) })
}

// ---------- tiny java helpers ----------

// index of the bracket closing the one at openIdx, skipping strings
function matchClose(text, openIdx) {
  const open = text[openIdx]
  const close = { '(': ')', '{': '}', '[': ']' }[open]
  let depth = 0
  for (let i = openIdx; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') {
      depth--
      if (depth === 0) {
        if (c !== close) return i
        return i
      }
    }
  }
  return text.length - 1
}

// split the text between parens on top level commas
function splitArgs(text) {
  const out = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1
      cur += text.slice(i, j + 1)
      i = j
      continue
    }
    if (c === '(' || c === '{' || c === '[') depth++
    if (c === ')' || c === '}' || c === ']') depth--
    // generics like Map<String, X> only show up in declarations, not call args we care about
    if (c === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// like splitArgs but also treats generics as nesting, for parameter lists
function splitParams(text) {
  const out = []
  let depth = 0
  let cur = ''
  for (const c of text) {
    if ('(<[{'.includes(c)) depth++
    if (')>]}'.includes(c)) depth--
    if (c === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// finds calls like `name(` (optionally `recv.name(`) and returns { recv, name, args, start, end }
function findCalls(text, nameRe) {
  const out = []
  const re = new RegExp(`(?<![\\w.])((?:[A-Za-z_][\\w]*\\.)*?)(${nameRe})\\s*\\(`, 'g')
  let m
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1
    const close = matchClose(text, open)
    const recv = m[1] ? m[1].slice(0, -1) : ''
    out.push({ recv, name: m[2], args: splitArgs(text.slice(open + 1, close)), start: m.index, end: close + 1, open })
  }
  return out
}

// methods per class: name -> [{ params, body, start, end }]
function parseMethods(file) {
  if (file.methods) return file.methods
  const methods = []
  const re = /(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)+(?:<[^>]*>\s*)?[\w.<>?,\[\]\s]+?\s+(\w+)\s*\(/g
  let m
  while ((m = re.exec(file.text))) {
    const open = m.index + m[0].length - 1
    const close = matchClose(file.text, open)
    const after = file.text.slice(close + 1, close + 200)
    const bodyStart = after.search(/\S/)
    if (bodyStart === -1) continue
    let k = close + 1 + bodyStart
    if (file.text.startsWith('throws', k)) k = file.text.indexOf('{', k)
    if (file.text[k] !== '{') continue
    const end = matchClose(file.text, k)
    const params = splitParams(file.text.slice(open + 1, close))
      .map((p) => p.replace(/@\w+\s*/g, '').trim().split(/\s+/).pop())
      .filter(Boolean)
    methods.push({ name: m[1], params, body: file.text.slice(k + 1, end), start: m.index, end: end + 1, file })
  }
  file.methods = methods
  return methods
}

function findMethod(className, name, argCount) {
  const file = files.get(className)
  if (!file) return null
  const ms = parseMethods(file).filter((m) => m.name === name)
  return ms.find((m) => m.params.length === argCount) ?? (argCount === undefined ? ms[0] : null)
}

// static field initializer `NAME = <expr>;` in a class
function findFieldInit(className, field) {
  const file = files.get(className)
  if (!file) return null
  const re = new RegExp(`\\b${field}\\s*=\\s*`, 'g')
  const m = re.exec(file.text)
  if (!m) return null
  let i = m.index + m[0].length
  const start = i
  let depth = 0
  for (; i < file.text.length; i++) {
    const c = file.text[i]
    if (c === '"') {
      let j = i + 1
      while (file.text[j] !== '"') j += file.text[j] === '\\' ? 2 : 1
      i = j
      continue
    }
    if ('({['.includes(c)) depth++
    if (')}]'.includes(c)) depth--
    if (c === ';' && depth === 0) break
  }
  return { text: file.text.slice(start, i), file }
}

// `var category = EntityConditions.CATEGORY;` -> use the right hand side
function localAlias(name, text, pos) {
  if (!/^[a-z]\w*$/.test(name)) return name
  const before = text.slice(0, pos)
  const all = [...before.matchAll(new RegExp(`\\b${name}\\s*=\\s*([A-Z][\\w.]*)\\s*;`, 'g'))]
  return all.length ? all[all.length - 1][1] : name
}

function substitute(text, params, args) {
  let out = text
  params.forEach((p, i) => {
    if (args[i] === undefined) return
    out = out.replace(new RegExp(`(?<![\\w."])${p}(?![\\w"])`, 'g'), () => args[i])
  })
  return out
}

// qualify bare static constants (CATEGORY, ENTITY) with their class so they still resolve after inlining
function qualify(arg, file) {
  if (/^[A-Z][A-Z_]*$/.test(arg) && new RegExp(`static[^;=]*\\b${arg}\\s*=`).test(file.text)) return `${file.name}.${arg}`
  return arg
}

// ---------- categories ----------

const categoryNames = {
  'Entity action': 'entity_action',
  'Bi-entity action': 'bientity_action',
  'Block action': 'block_action',
  'Item action': 'item_action',
  'Entity condition': 'entity_condition',
  'Bi-entity condition': 'bientity_condition',
  'Block condition': 'block_condition',
  'Item condition': 'item_condition',
  'Damage condition': 'damage_condition',
  'Fluid condition': 'fluid_condition',
  'Biome condition': 'biome_condition',
}

// "Actions.ENTITY", "BlockConditions.CATEGORY", "PowerTypes.REGISTRY" -> category key
function resolveCategory(recv, file) {
  if (!recv) return null
  let cls = file.name
  let field = recv
  if (recv.includes('.')) {
    const parts = recv.split('.')
    field = parts.pop()
    cls = parts.pop()
  }
  if (field === 'REGISTRY' && cls === 'PowerTypes') return 'power_type'
  const init = findFieldInit(cls, field)
  if (!init) return null
  const m = /new (?:ConditionCategory|ActionCategory)<>\(\s*"([^"]+)"/.exec(init.text)
  if (m) return categoryNames[m[1]] ?? null
  if (/new TypeRegistry/.test(init.text) && cls === 'PowerTypes') return 'power_type'
  return null
}

// ---------- ids ----------

function stringLits(expr) {
  return [...expr.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
}

// returns a list of full ids an id expression can be
function resolveIds(expr, ctxText, pos, file) {
  expr = expr.trim()
  let m
  if ((m = /^"([^"]*)"$/.exec(expr))) return [m[1].includes(':') ? m[1] : `apoli:${m[1]}`]
  if ((m = /^Identifier\.parse\((.*)\)$/s.exec(expr))) return resolveIds(m[1], ctxText, pos, file)
  if ((m = /^Identifier\.fromNamespaceAndPath\(\s*"([^"]+)"\s*,\s*(.*)\)$/s.exec(expr)))
    return resolveIds(m[2], ctxText, pos, file).map((id) => `${m[1]}:${id.split(':').pop()}`)
  if ((m = /^(?:\w+\.)?id\(\s*"([^"]+)"\s*\)$/.exec(expr))) {
    const idMethod = findMethod(file.name, 'id', 1)
    const ns = idMethod && /fromNamespaceAndPath\(\s*"([^"]+)"/.exec(idMethod.body)
    return [`${ns ? ns[1] : 'apoli'}:${m[1]}`]
  }
  // "apoli:" + (cond ? "a" : "b")
  if ((m = /^"([^"]*)"\s*\+\s*\(?\s*[\w.]+\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\)?$/.exec(expr)))
    return [m[1] + m[2], m[1] + m[3]].map((id) => (id.includes(':') ? id : `apoli:${id}`))
  // local variable assigned earlier in the same body
  if ((m = /^(\w+)$/.exec(expr))) {
    const before = ctxText.slice(0, pos)
    const assigns = [...before.matchAll(new RegExp(`\\b${m[1]}\\s*=\\s*([^;]+);`, 'g'))]
    if (assigns.length) {
      const resolved = resolveIds(assigns[assigns.length - 1][1], ctxText, assigns[assigns.length - 1].index, file)
      if (resolved) return resolved
    }
  }
  // "apoli:" + loopVar or bare loopVar
  if ((m = /^(?:"([^"]*)"\s*\+\s*)?(\w+)$/.exec(expr))) {
    const prefix = m[1] ?? ''
    const loop = findLoopValues(ctxText, pos, m[2])
    if (loop) return loop.map((v) => (prefix + v).includes(':') ? prefix + v : `apoli:${prefix}${v}`)
  }
  return null
}

// if the id expression uses a for loop variable, return its name and how to get its value for an id
function loopVariable(expr, text, pos) {
  const m = /^(?:Identifier\.(?:parse|fromNamespaceAndPath)\((?:\s*"[^"]*"\s*,)?\s*)?(?:"([^"]*)"\s*\+\s*)?(\w+)\)?$/.exec(expr.trim())
  if (!m || !findLoopValues(text, pos, m[2])) return null
  const prefix = m[1] ?? ''
  return { name: m[2], valueFor: (id) => (prefix.includes(':') ? id : id.split(':').pop()).slice(prefix.includes(':') ? prefix.length : 0) }
}

// loop values that are strings or enum constants (EquipmentSlot.HEAD -> head)
function findLoopConstants(text, pos, variable) {
  const lits = findLoopValues(text, pos, variable)
  if (lits && lits.length) return lits
  const re = new RegExp(`for\\s*\\(\\s*[\\w<>]+\\s+${variable}\\s*:\\s*List\\.of\\(([^)]*)\\)`, 'g')
  let last = null
  let m
  while ((m = re.exec(text.slice(0, pos)))) last = m
  if (!last) return null
  return last[1].split(',').map((v) => v.trim().split('.').pop().toLowerCase()).filter(Boolean)
}

function findLoopValues(text, pos, variable) {
  const before = text.slice(0, pos)
  const re = new RegExp(`for\\s*\\(\\s*[\\w<>]+\\s+${variable}\\s*:\\s*(?:new\\s+\\w+\\[\\]\\s*\\{([^}]*)\\}|List\\.of\\(([^)]*)\\))`, 'g')
  let last = null
  let m
  while ((m = re.exec(before))) last = m
  if (!last) return null
  return stringLits(last[1] ?? last[2])
}

// ---------- fields ----------

const commonHelperNames = new Set()

// pulls JsonDataType.field/required calls out of a chunk of code, following helper methods
function extractFields(text, file, visited = new Set(), depth = 0) {
  // java allows whitespace around the dot in a qualified method call
  text = text.replace(/\bJsonDataType\s*\.\s*(field|required|defaultedField)\b/g, 'JsonDataType.$1')
  const fields = []
  for (const call of findCalls(text, 'field|required|defaultedField')) {
    if (call.name === 'defaultedField') {
      if (!/CalioDataTypes$/.test(call.recv) && call.recv) continue
      const [type, name, def] = call.args
      const nm = /^"([^"]+)"$/.exec(name ?? '')
      if (nm) fields.push({ name: nm[1], typeExpr: type, required: false, default: def, file })
      continue
    }
    if (call.recv !== 'JsonDataType') continue
    const [, name, type, def] = call.args
    const nm = /^"([^"]+)"$/.exec(name ?? '')
    if (!nm) {
      // field names from a loop, like restrict_armor's `slot.getName()` over the armor slots
      const lv = /^(\w+)(?:\.getName\(\))?$/.exec(name ?? '')
      const loop = lv && findLoopConstants(text, call.start, lv[1])
      for (const n of loop ?? []) {
        fields.push({ name: n, typeExpr: type, required: call.name === 'required', default: call.name === 'field' ? def : undefined, file })
      }
      continue
    }
    fields.push({
      name: nm[1],
      typeExpr: type,
      required: call.name === 'required',
      default: call.name === 'field' ? def : undefined,
      file,
    })
  }
  // raw reads like json.getAsJsonObject("recipe")
  for (const m of text.matchAll(/\b(?:json|object)\.(getAsJsonObject|getAsJsonArray)\(\s*"([a-z_]+)"\s*\)/g)) {
    fields.push({ name: m[2], typeExpr: `gson:${m[1].slice(5).toLowerCase()}`, required: true, file })
  }
  for (const call of findCalls(text, 'getAs(?:String|Int|Boolean|Float|Double|JsonObject|JsonArray)')) {
    if (call.recv !== 'GsonHelper') continue
    const nm = /^"([^"]+)"$/.exec(call.args[1] ?? '')
    if (!nm || nm[1] === 'type') continue
    const kind = call.name.replace('getAs', '').toLowerCase()
    fields.push({ name: nm[1], typeExpr: `gson:${kind}`, required: call.args.length < 3, default: call.args[2], file })
  }
  if (depth > 6) return fields
  // helpers that get handed the json object
  for (const call of findCalls(text, '[a-z]\\w*')) {
    if (!call.args.some((a) => /^(json|object|element|jsonObject)$/.test(a) || /^(json|element)\.getAsJsonObject\(\)$/.test(a))) continue
    if (['field', 'required', 'read', 'write', 'has', 'get', 'getAsJsonObject', 'mapCodec', 'codec'].includes(call.name) && (call.recv === 'JsonDataType' || call.recv === 'json')) continue
    if (['field', 'required', 'has', 'get', 'getAsJsonObject'].includes(call.name) && !call.recv) continue
    if (call.recv === 'GsonHelper' || call.recv === 'JsonDataType') continue
    let cls = file.name
    if (call.recv && /^[A-Z]/.test(call.recv.split('.').pop())) cls = call.recv.split('.').pop()
    else if (call.recv) continue
    const method = findMethod(cls, call.name, call.args.length) ?? findInSupers(cls, call.name, call.args.length)
    if (!method) continue
    const key = `${method.file.name}.${call.name}/${call.args.length}`
    if (visited.has(key)) continue
    visited.add(key)
    commonHelperNames.add(key)
    // fold constant args (read(json, ops, false)) into the helper body so ternary field names resolve
    const args = call.args.map((a) => (/^(true|false|"[^"]*"|-?\d+)$/.test(a) ? a : null))
    const params = method.params.filter((_, i) => args[i] !== null)
    const body = evalConstants(substitute(method.body, params, args.filter((a) => a !== null)))
    fields.push(...extractFields(body, method.file, visited, depth + 1))
    visited.delete(key)
  }
  return fields
}

function findInSupers(cls, name, argCount) {
  let file = files.get(cls)
  for (let i = 0; file && i < 5; i++) {
    const m = /class\s+\w+(?:<[^{]*?>)?\s+extends\s+(\w+)/.exec(file.text)
    if (!m) return null
    const found = findMethod(m[1], name, argCount)
    if (found) return found
    file = files.get(m[1])
  }
  // nested classes like Query.read live inside another file
  for (const f of files.values()) {
    if (new RegExp(`(class|record|interface)\\s+${cls}\\b`).test(f.text)) {
      const ms = parseMethods(f).filter((m) => m.name === name && m.params.length === argCount)
      if (ms.length) return ms[0]
    }
  }
  return null
}

// ---------- registration discovery ----------

const results = new Map() // `${category}|${id}` -> entry
const unresolved = []

function addEntry(category, id, fields, file, extra = {}) {
  const key = `${category}|${id}`
  const seen = new Set()
  const deduped = []
  for (const f of fields) {
    if (seen.has(f.name)) continue
    seen.add(f.name)
    deduped.push(f)
  }
  results.set(key, { category, id, fields: deduped, source: file.name, ...extra })
}

// a call into a helper method gets inlined: params replaced with the call's args, then scanned again
function scan(text, file, depth = 0) {
  if (depth > 8) return
  const calls = findCalls(text, '\\w+')
  for (const call of calls) {
    // skip calls nested inside another call we already handled
    if (call.handledBy) continue
    if (call.name === 'registerMeta') {
      const cat = resolveCategory(qualify(localAlias(call.recv, text, call.start), file), file)
      if (cat) registerMeta(cat, file)
      continue
    }
    if ((call.name === 'register' || call.name === 'registerObject') && call.recv) {
      const recv = qualify(localAlias(call.recv, text, call.start), file)
      const cat = resolveCategory(recv, file)
      if (cat && call.args.length >= 2) {
        const ids = resolveIds(call.args[0], text, call.start, file)
        if (!ids) {
          unresolved.push({ category: cat, expr: call.args[0], file: file.name })
          continue
        }
        const valueText = call.args.slice(1).join(', ')
        const loopVar = loopVariable(call.args[0], text, call.start)
        for (const id of ids) {
          let vt = valueText
          if (loopVar) vt = substitute(vt, [loopVar.name], [`"${loopVar.valueFor(id)}"`])
          vt = evalConstants(vt)
          const fields = cat === 'power_type' ? powerFields(vt, file) : extractFields(vt, file)
          addEntry(cat, id, fields, file)
        }
        markNested(calls, call)
        continue
      }
    }
    // helper method: same class (bare call) or ClassName.method(...)
    let method = null
    if (!call.recv) method = findMethod(file.name, call.name, call.args.length)
    else if (/^[A-Z]\w*$/.test(call.recv)) method = findMethod(call.recv, call.name, call.args.length)
    if (!method || !method.params.length) continue
    if (!/\bregister(?:Object|Meta)?\s*\(|\b\w+\s*\(/.test(method.body)) continue
    if (!registersSomething(method)) continue
    const args = call.args.map((a) => qualify(localAlias(a, text, call.start), file))
    const inlined = substitute(method.body, method.params, args)
    scan(inlined, method.file, depth + 1)
    markNested(calls, call)
  }
}

function markNested(calls, outer) {
  for (const c of calls) if (c !== outer && c.start > outer.start && c.end <= outer.end) c.handledBy = outer
}

const registersCache = new Map()
function registersSomething(method, depth = 0) {
  const key = `${method.file.name}.${method.name}/${method.params.length}`
  if (registersCache.has(key)) return registersCache.get(key)
  registersCache.set(key, false)
  let found = /\.(register|registerObject)\s*\(/.test(method.body) && method.params.length > 0
  if (!found && depth < 5) {
    for (const call of findCalls(method.body, '\\w+')) {
      const target = !call.recv ? findMethod(method.file.name, call.name, call.args.length)
        : /^[A-Z]\w*$/.test(call.recv) ? findMethod(call.recv, call.name, call.args.length) : null
      if (target && target !== method && target.params.length && registersSomething(target, depth + 1)) {
        found = true
        break
      }
    }
  }
  registersCache.set(key, found)
  return found
}

function registerMeta(category, file) {
  const method = findMethod('ConditionCategory', 'registerMeta', 0)
  for (const call of findCalls(method.body, 'register')) {
    if (call.recv) continue
    const ids = resolveIds(call.args[0], method.body, call.start, method.file)
    const fields = extractFields(call.args.slice(1).join(', '), method.file).map((f) =>
      f.typeExpr.includes('list(codec)') ? { ...f, typeExpr: `list(${category})` } : f,
    )
    for (const id of ids) addEntry(category, id, fields, method.file, { meta: true })
  }
}

// a power type's codec expression -> fields
function powerFields(expr, file, visited = new Set()) {
  expr = expr.trim()
  let m
  // Class.CODEC / Class.SOME_CODEC
  if ((m = /^(\w+)\.([A-Z_]+)$/.exec(expr))) {
    const init = findFieldInit(m[1], m[2])
    if (init) return powerFields(init.text, init.file, visited)
  }
  // Class.method(args) returning a codec
  if ((m = /^(\w+)\.(\w+)\((.*)\)$/s.exec(expr)) && m[2] !== 'mapCodec') {
    const args = splitArgs(m[3])
    const method = findMethod(m[1], m[2], args.length)
    if (method && !visited.has(method)) {
      visited.add(method)
      return powerFields(substitute(method.body, method.params, args), method.file, visited)
    }
  }
  // bare method call in the same class, codec(false)
  if ((m = /^(\w+)\((.*)\)$/s.exec(expr)) && m[1] !== 'mapCodec') {
    const args = splitArgs(m[2])
    const method = findMethod(file.name, m[1], args.length) ?? findInSupers(file.name, m[1], args.length)
    if (method && !visited.has(method)) {
      visited.add(method)
      return powerFields(substitute(method.body, method.params, args), method.file, visited)
    }
  }
  return extractFields(evalConstants(expr), file)
}

// after inlining, `false ? a : b` and `"x".equals("y")` can be folded so each id gets its own fields and defaults
function evalConstants(text) {
  text = text.replace(/"([^"\\]*)"\.equals\(\s*"([^"\\]*)"\s*\)/g, (_, a, b) => String(a === b))
  text = text.replace(/!\s*true\b/g, 'false').replace(/!\s*false\b/g, 'true')
  for (let guard = 0; guard < 50; guard++) {
    const m = /(?<![\w.])(true|false)\s*\?/.exec(text)
    if (!m) break
    const start = m.index
    let i = m.index + m[0].length
    // read the "then" part up to the matching top level ':'
    let depth = 0
    let colon = -1
    let end = -1
    let nested = 0
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (c === '"') {
        let k = j + 1
        while (k < text.length && text[k] !== '"') k += text[k] === '\\' ? 2 : 1
        j = k
        continue
      }
      if ('({['.includes(c)) depth++
      else if (')}]'.includes(c)) {
        if (depth === 0) { end = j; break }
        depth--
      } else if (depth === 0 && c === '?') nested++
      else if (depth === 0 && c === ':' && colon === -1) {
        if (nested) nested--
        else colon = j
      } else if (depth === 0 && (c === ',' || c === ';') && colon !== -1) { end = j; break }
    }
    if (colon === -1) break
    if (end === -1) end = text.length
    const chosen = m[1] === 'true' ? text.slice(i, colon) : text.slice(colon + 1, end)
    text = text.slice(0, start) + chosen.trim() + text.slice(end)
  }
  return text
}

for (const file of files.values()) {
  if (!/\/(power|origin)\//.test(file.path)) continue
  // entry points: everything outside helper methods (methods with params that register stuff)
  const methods = parseMethods(file)
  let text = file.text
  for (const m of methods) {
    if (m.params.length && registersSomething(m)) text = text.slice(0, m.start) + ' '.repeat(m.end - m.start) + text.slice(m.end)
  }
  if (file.name === 'ConditionCategory') continue
  scan(text, file)
}

// ---------- aliases ----------

const aliases = []
const ptFile = files.get('PowerTypes')
for (const m of ptFile.text.matchAll(/addPathAlias\(\s*"([^"]+)"\s*,\s*(?:"([^"]+)"|(\w+)\.getPath\(\))\s*\)/g)) {
  let target = m[2]
  if (!target) {
    const init = findFieldInit('PowerTypes', m[3])
    target = init && stringLits(init.text)[0]
  }
  aliases.push({ category: 'power_type', from: `apoli:${m[1]}`, to: `apoli:${target}` })
}
for (const f of files.values()) {
  for (const m of f.text.matchAll(/(\w+(?:\.\w+)*)\.addPathAlias\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
    if (f.name === 'PowerTypes') continue
    aliases.push({ category: m[1], from: `apoli:${m[2]}`, to: `apoli:${m[3]}`, file: f.name })
  }
}

// ---------- type expressions -> field kinds ----------

const typeExprs = new Map()
const catalogCategories = new Set(Object.values(categoryNames))

function kindOf(expr, file) {
  if (!expr) return { kind: 'json' }
  expr = expr.replace(/\s+/g, ' ').trim()
  let m
  if ((m = /^gson:(\w+)$/.exec(expr))) {
    return { kind: { string: 'string', int: 'int', boolean: 'boolean', float: 'float', double: 'float', jsonobject: 'json', jsonarray: 'json' }[m[1]] ?? 'json' }
  }
  if ((m = /^(?:CalioDataTypes\.)?list\((.*)\)$/.exec(expr))) return { kind: 'list', of: kindOf(m[1], file) }
  if ((m = /^list\((\w+_(?:action|condition))\)$/.exec(expr))) return { kind: 'list', of: { kind: m[1] } }
  // category codecs
  if ((m = /^((?:\w+\.)?(?:CATEGORY|ENTITY|BIENTITY|BLOCK|ITEM))\.codec\(\)$/.exec(expr))) {
    const cat = resolveCategory(qualify(m[1], file), file)
    if (cat) return { kind: cat }
  }
  if (/^EntityCondition\.CODEC$/.test(expr)) return { kind: 'entity_condition' }
  const simple = {
    'CalioDataTypes.BOOLEAN': 'boolean',
    'CalioDataTypes.INT': 'int',
    'CalioDataTypes.POSITIVE_INT': 'int',
    'CalioDataTypes.FLOAT': 'float',
    'CalioDataTypes.POSITIVE_FLOAT': 'float',
    'CalioDataTypes.DOUBLE': 'float',
    'CalioDataTypes.POSITIVE_DOUBLE': 'float',
    'CalioDataTypes.NUMBER': 'float',
    'CalioDataTypes.STRING': 'string',
    'CalioDataTypes.TEXT': 'text',
    'CalioDataTypes.IDENTIFIER': 'identifier',
    'CalioDataTypes.NBT': 'nbt',
    'CalioDataTypes.ITEM': 'item',
    'CalioDataTypes.ITEM_STACK': 'item_stack',
    'CalioDataTypes.ITEM_STACKS': 'item_stacks',
    'CalioDataTypes.INGREDIENT': 'ingredient',
    'CalioDataTypes.STATUS_EFFECT_INSTANCE': 'status_effect_instance',
    'CalioDataTypes.STATUS_EFFECT_INSTANCES': 'status_effect_instances',
    'CalioDataTypes.ATTRIBUTE_MODIFIER': 'attribute_modifier',
    'CalioDataTypes.ATTRIBUTE_MODIFIERS': 'attribute_modifiers',
    'CalioDataTypes.ATTRIBUTED_ATTRIBUTE_MODIFIER': 'attributed_attribute_modifier',
    'CalioDataTypes.ATTRIBUTED_ATTRIBUTE_MODIFIERS': 'attributed_attribute_modifiers',
    'CalioDataTypes.SOUND_EVENT': 'sound_event',
    'CalioDataTypes.PARTICLE_EFFECT_OR_TYPE': 'particle',
    'CalioDataTypes.PARTICLE_EFFECT': 'particle',
    'CalioDataTypes.SHAPE': 'shape',
    'CalioDataTypes.COMPARISON': 'comparison',
    'CalioDataTypes.KEY': 'key',
    'CalioDataTypes.BACKWARDS_COMPATIBLE_KEY': 'key',
    'KeyBindingData.BACKWARDS_COMPATIBLE_CODEC': 'key',
    'KeyBindingData.CODEC': 'key',
    'CalioDataTypes.SINGLE_HUD_RENDER': 'hud_render',
    'CalioDataTypes.HUD_RENDER': 'hud_render',
    'HudRender.CODEC': 'hud_render',
    'HudRender.SINGLE_CODEC': 'hud_render',
    'CalioDataTypes.MODIFIER': 'modifier',
    'CalioDataTypes.MODIFIERS': 'modifiers',
    'CalioDataTypes.STATUS_EFFECT': 'status_effect',
    'CalioDataTypes.PARTICLE_TYPE': 'particle_type',
    'CalioDataTypes.ITEM_TAG': 'item_tag',
    'CalioDataTypes.BLOCK_TAG': 'block_tag',
    'CalioDataTypes.FLUID_TAG': 'fluid_tag',
    'CalioDataTypes.ENTITY_TAG': 'entity_type_tag',
    'CalioDataTypes.BIOME_TAG': 'biome_tag',
    'CalioDataTypes.BLOCK': 'block',
    'CalioDataTypes.BLOCK_STATE': 'block_state',
    'CalioDataTypes.EQUIPMENT_SLOT': 'equipment_slot',
    'CalioDataTypes.VECTOR': 'vector',
    'CalioDataTypes.STAT': 'stat',
    'DamageSourceDescription.CODEC': 'damage_source',
    'GuiTitle.CODEC': 'gui_title',
    'ConditionedOrigin.CODEC': 'layer_entry',
    'OriginUpgrade.CODEC': 'origin_upgrade',
  }
  if (simple[expr]) return { kind: simple[expr] }
  if ((m = /^CalioDataTypes\.registry\(BuiltInRegistries\.(\w+)\)$/.exec(expr))) return { kind: 'registry', registry: m[1].toLowerCase() }
  if ((m = /^CalioDataTypes\.registryKey\(Registries\.(\w+)\)$/.exec(expr))) return { kind: 'registry', registry: m[1].toLowerCase() }
  if ((m = /^CalioDataTypes\.tag\(Registries\.(\w+)\)$/.exec(expr))) return { kind: 'tag', registry: m[1].toLowerCase() }
  if ((m = /^CalioDataTypes\.enumValue\((\w+(?:\.\w+)*)\.class/.exec(expr))) {
    const values = enumValues(m[1], file)
    if (values) return { kind: 'enum', values }
  }
  if ((m = /^(\w+)\.CODEC$/.exec(expr))) {
    const values = enumValues(m[1], file)
    if (values) return { kind: 'enum', values }
  }
  if (catalogCategories.has(expr)) return { kind: expr }
  if (/^CalioDataTypes\.STRING\.(xmap|comapFlatMap)\(/.test(expr)) return { kind: 'string' }
  // inline object codecs read their own fields, so they become nested objects
  if (/^JsonDataType\.(map)?[cC]odec\(/.test(expr) && file) {
    const inner = extractFields(expr, file)
    if (inner.length && !kindOf.depth) {
      kindOf.depth = 1
      const fields = inner.map(mapField)
      kindOf.depth = 0
      // codecs that also parse the same object as an item stack, like starting_equipment's stacks
      const base = /ItemStackData\.CODEC\.parse|read\(ItemStackData\.CODEC/.test(expr) ? { base: 'item_stack' } : {}
      return { kind: 'object', fields, ...base }
    }
  }
  if ((m = /^Actions\.(ENTITY|BIENTITY|BLOCK|ITEM)\.listCodec\(\)$/.exec(expr))) return { kind: 'list', of: { kind: `${m[1].toLowerCase()}_action` }, single: true }
  if ((m = /^(?:CalioDataTypes\.)?weightedList\((.*)\)$/.exec(expr))) return { kind: 'weighted_list', of: kindOf(m[1], file) }
  if (expr === 'ItemStackData.CODEC') return { kind: 'item_stack' }
  if (expr === 'ITEM_OR_ITEM_STACK') return { kind: 'item_or_item_stack' }
  if ((m = /^CalioDataTypes\.IDENTIFIER\.xmap\(id -> ResourceKey\.create\(Registries\.(\w+)/.exec(expr))) return { kind: 'registry', registry: m[1].toLowerCase() }
  if ((m = /^CalioDataTypes\.IDENTIFIER\.xmap\(id -> TagKey\.create\(Registries\.(\w+)/.exec(expr))) return { kind: 'tag', registry: m[1].toLowerCase() }
  if (/^CalioDataTypes\.IDENTIFIER\.comapFlatMap\(.*ATTRIBUTE/.test(expr)) return { kind: 'registry', registry: 'attribute' }
  if (/Component\.translatable/.test(expr) && /TEXT/.test(expr)) return { kind: 'text' }
  if ((m = /^CalioDataTypes\.(INT|FLOAT|DOUBLE|STRING|IDENTIFIER)\.validate\(/.exec(expr))) return kindOf(`CalioDataTypes.${m[1]}`, file)
  // a constant or local declared somewhere in the file
  if (/^[A-Za-z_]\w*$/.test(expr) && file && !kindOf.seen?.has(expr + file.name)) {
    kindOf.seen ??= new Set()
    kindOf.seen.add(expr + file.name)
    const init = findFieldInit(file.name, expr)
    kindOf.seen.delete(expr + file.name)
    if (init) {
      const k = kindOf(init.text, init.file)
      if (k.kind !== 'json') return k
    }
  }
  if ((m = /^(\w+)\.([A-Z_]+)$/.exec(expr)) && files.has(m[1])) {
    const init = findFieldInit(m[1], m[2])
    if (init) {
      const k = kindOf(init.text, init.file)
      if (k.kind !== 'json') return k
    }
  }
  typeExprs.set(expr, (typeExprs.get(expr) ?? 0) + 1)
  return { kind: 'json', javaType: expr }
}

const mcEnums = {
  EquipmentSlot: ['mainhand', 'offhand', 'feet', 'legs', 'chest', 'head', 'body', 'saddle'],
  Direction: ['down', 'up', 'north', 'south', 'west', 'east'],
  'Direction.Axis': ['x', 'y', 'z'],
  ClipContext_Block: ['collider', 'outline', 'visual', 'fallingdust_collider'],
  'ClipContext.Block': ['collider', 'outline', 'visual', 'falldamage_resetting'],
  'ClipContext.Fluid': ['none', 'source_only', 'any', 'water'],
  'InteractionHand': ['main_hand', 'off_hand'],
  'Explosion.BlockInteraction': ['keep', 'destroy', 'destroy_with_decay', 'trigger_block'],
  'Pose': ['standing', 'fall_flying', 'sleeping', 'swimming', 'spin_attack', 'crouching', 'long_jumping', 'dying', 'croaking', 'using_tongue', 'sitting', 'roaring', 'sniffing', 'emerging', 'digging', 'sliding', 'shooting', 'inhaling'],
  'GameType': ['survival', 'creative', 'adventure', 'spectator'],
  'Difficulty': ['peaceful', 'easy', 'normal', 'hard'],
  'Biome.Precipitation': ['none', 'rain', 'snow'],
  'HumanoidArm': ['left', 'right'],
  SoundSource: ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui'],
  'Heightmap.Types': ['world_surface_wg', 'world_surface', 'ocean_floor_wg', 'ocean_floor', 'motion_blocking', 'motion_blocking_no_leaves'],
  LightLayer: ['sky', 'block'],
  'GameEventListener.DeliveryMode': ['unspecified', 'by_distance'],
}

function enumValues(name, preferred) {
  if (mcEnums[name]) return mcEnums[name]
  const simpleName = name.split('.').pop()
  const ordered = preferred ? [preferred, ...[...files.values()].filter((f) => f !== preferred)] : [...files.values()]
  for (const f of ordered) {
    const re = new RegExp(`enum\\s+${simpleName}\\b[^{]*\\{`, 'g')
    const m = re.exec(f.text)
    if (!m) continue
    const open = m.index + m[0].length - 1
    const close = matchClose(f.text, open)
    const body = f.text.slice(open + 1, close)
    const constEnd = body.search(/;/)
    const consts = (constEnd === -1 ? body : body.slice(0, constEnd))
    const values = []
    let depth = 0
    let cur = ''
    for (const c of consts) {
      if (c === '(' || c === '{') { depth++; continue }
      if (c === ')' || c === '}') { depth--; continue }
      if (c === ',' && depth === 0) {
        values.push(cur)
        cur = ''
      } else if (depth === 0) cur += c
    }
    values.push(cur)
    return values.map((v) => v.trim()).filter((v) => /^[A-Z_0-9]+$/.test(v)).map((v) => v.toLowerCase())
  }
  return null
}

function cleanDefault(expr) {
  if (expr === undefined) return undefined
  expr = expr.replace(/\s+/g, ' ').trim()
  if (expr === 'null') return undefined
  if (/^-?\d+(\.\d+)?[FfDdLl]?$/.test(expr)) return { value: Number(expr.replace(/[FfDdLl]$/, '')) }
  if (expr === 'true' || expr === 'false') return { value: expr === 'true' }
  if (/^"[^"]*"$/.test(expr)) return { value: expr.slice(1, -1) }
  if (/^(List\.of\(\)|new ArrayList<>\(\)|Collections\.emptyList\(\))$/.test(expr)) return { value: [] }
  if (/^Integer\.MAX_VALUE$/.test(expr)) return { value: 2147483647 }
  if (/^Integer\.MIN_VALUE$/.test(expr)) return { value: -2147483648 }
  if (/^Vec3\.ZERO$/.test(expr)) return { value: { x: 0, y: 0, z: 0 } }
  if ((m2 = /^\w+(?:\.\w+)*\.([A-Z_]+)$/.exec(expr)) && !/^HudRender\./.test(expr)) return { value: m2[1].toLowerCase(), javaDefault: expr }
  return { javaDefault: expr }
}
let m2

const comparisonSymbols = {
  equal: '==', less_than: '<', greater_than: '>', less_than_or_equal: '<=', greater_than_or_equal: '>=', not_equal: '!=',
}

function mapField(f) {
  const d = cleanDefault(f.default)
  if (d && /^Comparison\./.test(d.javaDefault ?? '')) d.value = comparisonSymbols[d.value] ?? d.value
  return {
    name: f.name,
    ...kindOf(f.typeExpr, f.file),
    required: f.required,
    ...(d && 'value' in d ? { default: d.value } : {}),
    ...(d && d.javaDefault ? { javaDefault: d.javaDefault } : {}),
  }
}

// ---------- output ----------

const catalog = {
  generatedFrom: 're-origin-26.3',
  categories: Object.values(categoryNames).concat('power_type'),
  types: [],
  aliases,
  unresolved,
  unknownTypeExprs: [],
}

for (const entry of results.values()) {
  catalog.types.push({
    category: entry.category,
    id: entry.id,
    source: entry.source,
    ...(entry.meta ? { meta: true } : {}),
    fields: entry.fields.map(mapField),
  })
}
// meta action helpers take the category as a parameter, which the codec lookup can't see through
for (const t of catalog.types) {
  if (t.id !== 'apoli:if_else_list') continue
  const cond = t.category.replace('_action', '_condition')
  for (const f of t.fields) {
    if (f.kind === 'list' && f.of.kind === 'object') {
      f.single = true
      f.of.fields = [
        { name: 'action', kind: t.category, required: true },
        { name: 'condition', kind: cond, required: true },
      ]
    }
  }
}

// shared object shapes used by fields (modifier, hud_render, ...) and the origin/layer files
const dataTypeSources = {
  hud_render: ['HudRender', 'SINGLE_CODEC'],
  key: ['KeyBindingData', 'CODEC'],
  modifier: ['Modifier', 'CODEC'],
  attribute_modifier: ['AttributeModifierData', 'codec/1'],
  attributed_attribute_modifier: ['AttributeModifierData', 'ATTRIBUTED_CODEC'],
  item_stack: ['ItemStackData', 'CODEC'],
  status_effect_instance: ['StatusEffectData', 'CODEC'],
  damage_source: ['DamageSourceDescription', 'CODEC'],
  particle: ['ParticleData', 'CODEC'],
  origin: ['Origin', 'fromJson/3'],
  origin_layer: ['OriginLayer', 'ctor/3'],
  origin_upgrade: ['OriginUpgrade', 'CODEC'],
  layer_entry: ['OriginLayer', 'ConditionedOrigin.CODEC'],
  gui_title: ['OriginLayer', 'GuiTitle.CODEC'],
}
catalog.dataTypes = {}
for (const [kind, [cls, where]] of Object.entries(dataTypeSources)) {
  const file = files.get(cls)
  let text = null
  if (where.startsWith('ctor/')) {
    const m = new RegExp(`(?:private|public|protected)\\s+${cls}\\s*\\(`).exec(file.text)
    if (m) {
      const close = matchClose(file.text, m.index + m[0].length - 1)
      const open = file.text.indexOf('{', close)
      text = file.text.slice(open, matchClose(file.text, open))
    }
  } else if (where.includes('/')) {
    const [name, n] = where.split('/')
    const method = parseMethods(file).find((m) => m.name === name && m.params.length === Number(n))
    text = method?.body
  } else if (where.includes('.')) {
    // nested class constant, look for the nested class body
    const [inner, field] = where.split('.')
    const m = new RegExp(`(class|record)\\s+${inner}\\b[^{]*\\{`).exec(file.text)
    if (m) {
      const end = matchClose(file.text, m.index + m[0].length - 1)
      const body = file.text.slice(m.index, end)
      const fm = new RegExp(`\\b${field}\\s*=`).exec(body)
      text = fm ? body.slice(fm.index) : null
      if (text) {
        // cut at the end of the initializer
        let depth = 0
        for (let i = 0; i < text.length; i++) {
          if ('({['.includes(text[i])) depth++
          if (')}]'.includes(text[i])) depth--
          if (text[i] === ';' && depth === 0) { text = text.slice(0, i); break }
        }
      }
    }
  } else text = findFieldInit(cls, where)?.text
  if (!text) {
    console.warn('no source for data type', kind)
    continue
  }
  const seen = new Set()
  catalog.dataTypes[kind] = {
    source: cls,
    fields: extractFields(text, file).filter((f) => !seen.has(f.name) && seen.add(f.name)).map(mapField),
  }
}
// modifier operations come from a registry, not a field call
{
  const mod = files.get('Modifier')
  const builtins = [...mod.text.matchAll(/builtin\(\s*"([a-z_]+)"/g)].map((m) => m[1])
  const legacy = [...mod.text.matchAll(/case\s+"([a-z_]+)"\s*->/g)].map((m) => m[1])
  const fields = catalog.dataTypes.modifier.fields
  fields.unshift({ name: 'operation', kind: 'enum', values: builtins, legacyValues: legacy, required: true })
  const nested = fields.find((f) => f.name === 'modifier')
  if (nested) Object.assign(nested, { kind: 'list', of: { kind: 'modifier' }, single: true })
}
// damage source flags are read in a loop over a map
{
  const dsd = files.get('DamageSourceDescription')
  const flags = [...dsd.text.matchAll(/FLAGS\.put\(\s*"([a-z_]+)"/g)].map((m) => m[1])
  catalog.dataTypes.damage_source.fields.push(...flags.map((name) => ({ name, kind: 'boolean', required: false, default: false })))
}

// the power file fields every power type shares, from PowerLoader and BadgeManager
catalog.dataTypes.power = {
  source: 'PowerLoader',
  fields: [
    { name: 'type', kind: 'power_type_id', required: true },
    { name: 'name', kind: 'text', required: false },
    { name: 'description', kind: 'text', required: false },
    { name: 'hidden', kind: 'boolean', required: false, default: false },
    { name: 'loading_priority', kind: 'int', required: false, default: 0 },
    { name: 'badges', kind: 'list', of: { kind: 'badge' }, required: false },
  ],
}

// built-in content: origins can reference these without the pack defining them, and they make good examples
{
  const res = join(modRoot, 'src/main/resources')
  const builtins = { powers: {}, origins: {}, layers: {}, lang: {} }
  const dirs = { powers: 'powers', origins: 'origins', layers: 'origin_layers' }
  const dataRoot = join(res, 'data')
  for (const ns of readdirSync(dataRoot)) {
    for (const [key, dir] of Object.entries(dirs)) {
      const base = join(dataRoot, ns, dir)
      let list = []
      try { list = walkJson(base) } catch { continue }
      for (const file of list) {
        const id = `${ns}:${file.slice(base.length + 1).replace(/\.json[5c]?$/, '')}`
        try { builtins[key][id] = JSON.parse(readFileSync(file, 'utf8')) } catch {}
      }
    }
  }
  for (const ns of ['origins', 'apoli', 'viridian']) {
    try {
      const lang = JSON.parse(readFileSync(join(res, 'assets', ns, 'lang/en_us.json'), 'utf8'))
      for (const [k, v] of Object.entries(lang)) if (/^(power|origin|layer)\./.test(k)) builtins.lang[k] = v
    } catch {}
  }
  catalog.builtins = builtins
}

function walkJson(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walkJson(p))
    else if (/\.json[5c]?$/.test(name)) out.push(p)
  }
  return out
}

catalog.types.sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id))
catalog.unknownTypeExprs = [...typeExprs.entries()].sort((a, b) => b[1] - a[1]).map(([expr, n]) => ({ expr, n }))

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(catalog, null, 1) + '\n')

const counts = {}
for (const t of catalog.types) counts[t.category] = (counts[t.category] ?? 0) + 1
console.log('wrote', outFile)
console.log(counts)
if (unresolved.length) console.log('unresolved ids:', unresolved)
console.log('unknown type exprs:', catalog.unknownTypeExprs.length)
