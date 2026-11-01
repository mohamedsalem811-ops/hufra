# @hufra/contracts

The HUFRA API contract: **zod schemas and TypeScript types** for every request and response, shared by the API (`apps/api`), the mobile app (`apps/mobile`) and the admin panel (`apps/admin`).

| File | What |
|---|---|
| `src/enums.ts` | roles, locales, severities, report statuses (and their order), photo stages, push platforms |
| `src/limits.ts` | limits the apps must respect before sending: photo bytes/pixels/formats/no-EXIF, password length, text lengths, search radius |
| `src/requests.ts` | request bodies and query strings the API validates (register, login, report, status change, ...) |
| `src/responses.ts` | what the API returns. Public report shapes are **strict**: an extra field fails |

## How it stays true

- The API validates requests with these exact schemas (`apps/api/src/lib/validation.ts` only adds server policy, such as refusing publicly known passwords).
- `apps/api/tests/integration/contracts.test.ts` calls the real endpoints and parses every response with these schemas. A renamed, missing or leaked field fails CI.

## Use

```ts
import { createPotholeSchema, publicPotholeDetailResponseSchema, PHOTO_LIMITS, type PublicPotholeDetail } from '@hufra/contracts'
const body = createPotholeSchema.parse(form)                      // build a valid request
const report = publicPotholeDetailResponseSchema.parse(await res.json()) // trust the response shape
```

An OpenAPI description and a generated typed client are added in Phase 7.1 (docs/EXECUTION_PLAN.md).
