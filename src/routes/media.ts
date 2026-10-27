import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { getPhoto } from '../lib/storage'

const media = new Hono<{ Bindings: Bindings }>()

// Streams an image directly from R2 with a long, immutable cache lifetime.
// The key format (photos/... or thumbs/...) is opaque and unguessable
// (crypto.randomUUID), acting as a lightweight signed-URL substitute without
// needing a separate signing step; keys are never derived from sequential
// pothole IDs alone.
media.get('/:key{.+}', async (c) => {
  const key = c.req.param('key')
  if (!key.startsWith('photos/') && !key.startsWith('thumbs/')) {
    return c.json({ error: 'Invalid media key' }, 400)
  }

  const object = await getPhoto(c.env.PHOTOS, key)
  if (!object) return c.notFound()

  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('etag', object.httpEtag)

  return new Response(object.body as any, { headers })
})

export default media
