/**
 * Ports for the browser tests. The API uses 8788 because it is one of the local
 * origins the API trusts (apps/api/src/lib/origins.ts); stop a local dev API
 * before running these. The panel uses its own port, apart from the usual 5174.
 */
export const API_PORT = 8788
export const WEB_PORT = 5184
