/** GET a public API answer from the same site; null when it cannot be had (offline, server error). */
export async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { Accept: 'application/json' } })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** Short element builder: text only (never HTML), so API data can never inject markup. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string | null)[]) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  for (const c of children) if (c !== null) node.append(c)
  return node
}

export const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))

/** Photos and logos are served by the same Worker under /media/<key>. */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`
