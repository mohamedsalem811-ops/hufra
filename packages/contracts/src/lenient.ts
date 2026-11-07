// The app reads server answers with lenient(schema): fields it does not know
// are dropped instead of failing the whole answer. Then the server can add
// information (a new field in a campaign, say) without breaking app copies
// already on people's phones, which update slowly.
//
// The server's own tests keep the strict schemas, so a public answer that
// leaks a private field is still caught there.
import { z } from 'zod'

type Any = z.ZodType
const cache = new WeakMap<Any, Any>()

export function lenient<S extends Any>(schema: S): S {
  const hit = cache.get(schema)
  if (hit) return hit as S
  const out = convert(schema)
  cache.set(schema, out)
  return out as S
}

function convert(schema: Any): Any {
  const def = (schema as any)._zod?.def
  switch (def?.type) {
    case 'object': {
      const shape: Record<string, Any> = {}
      for (const [k, v] of Object.entries(def.shape as Record<string, Any>)) shape[k] = lenient(v)
      return z.object(shape) // unknown keys are stripped
    }
    case 'array':
      return z.array(lenient(def.element))
    case 'nullable':
      return lenient(def.innerType).nullable()
    case 'optional':
      return lenient(def.innerType).optional()
    case 'default':
      return lenient(def.innerType).default(def.defaultValue)
    case 'union':
      return z.union((def.options as Any[]).map((o) => lenient(o)) as [Any, Any, ...Any[]])
    default:
      // Strings, numbers, enums, literals...: unchanged.
      return schema
  }
}
