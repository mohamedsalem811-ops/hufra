#!/usr/bin/env node
// Create a super_admin account, or reset an existing account's password and
// make it super_admin, directly in D1. This is the only supported way to get
// the first admin: no password is ever stored in the repository.
//
//   npm run admin:set-password -- --email you@example.com            # production D1
//   npm run admin:set-password -- --email you@example.com --local    # local dev D1
//
// The password is asked for interactively (not echoed), or read from the
// ADMIN_PASSWORD environment variable for non-interactive use. All of that
// account's existing sessions are signed out.
//
// The hash format matches src/lib/password.ts: pbkdf2$<iterations>$<salt>$<hash>.
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DB_NAME = 'hufra-production'
// Cloudflare Workers caps PBKDF2 at 100,000 iterations; keep in sync with src/lib/password.ts.
const ITERATIONS = 100_000
const MIN_LENGTH = 12
// Keep in sync with KNOWN_PUBLIC_PASSWORDS in src/lib/password.ts.
const KNOWN_PUBLIC_PASSWORDS = new Set(['Hufra@Admin2026!'])
const EMAIL_RE = /^[^\s@'"\;]+@[^\s@'"\;]+\.[^\s@'"\;]+$/

export function hashPasswordNode(password, salt = randomBytes(16)) {
  const derived = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  return `pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${derived.toString('base64')}`
}

export function validateAdminPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`
  if (password.length > 128) return 'Password must be at most 128 characters.'
  if (KNOWN_PUBLIC_PASSWORDS.has(password)) return 'That password is publicly known. Choose another one.'
  return null
}

export function buildSetAdminSql(email, passwordHash) {
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email address')
  if (!/^pbkdf2\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(passwordHash)) throw new Error('Invalid hash')
  return `INSERT INTO users (email, password_hash, role, code, locale, display_name, consent_at)
VALUES ('${email}', '${passwordHash}', 'super_admin', '', 'ar', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'super_admin', deleted_at = NULL;
UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE email = '${email}');
`
}

function parseArgs(argv) {
  const out = { email: null, local: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') out.email = argv[++i]
    else if (argv[i].startsWith('--email=')) out.email = argv[i].slice(8)
    else if (argv[i] === '--local') out.local = true
    else if (argv[i] === '--remote') out.local = false
    else if (argv[i] === '-h' || argv[i] === '--help') out.help = true
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  return out
}

function askHidden(question) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) return reject(new Error('No terminal for the password prompt; set ADMIN_PASSWORD instead.'))
    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        stdout.write('\n')
        resolve(value)
      } else if (ch === '\u0003') {
        stdin.setRawMode(false)
        process.exit(130)
      } else if (ch === '\u007f' || ch === '\b') {
        value = value.slice(0, -1)
      } else {
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.email) {
    console.log('Usage: npm run admin:set-password -- --email you@example.com [--local]')
    process.exit(args.help ? 0 : 1)
  }
  const email = args.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email address')

  let password = process.env.ADMIN_PASSWORD
  if (!password) {
    password = await askHidden(`New password for ${email}: `)
    const again = await askHidden('Repeat it: ')
    if (password !== again) throw new Error('The passwords do not match.')
  }
  const problem = validateAdminPassword(password)
  if (problem) throw new Error(problem)

  const dir = mkdtempSync(join(tmpdir(), 'hufra-admin-'))
  const file = join(dir, 'set-admin.sql')
  try {
    writeFileSync(file, buildSetAdminSql(email, hashPasswordNode(password)), { mode: 0o600 })
    const target = args.local ? '--local' : '--remote'
    const res = spawnSync('npx', ['--yes', 'wrangler', 'd1', 'execute', DB_NAME, target, `--file=${file}`], {
      stdio: 'inherit',
    })
    if (res.status !== 0) throw new Error('wrangler d1 execute failed (see output above).')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(`\n${email} is now a super_admin with the new password (${args.local ? 'local' : 'production'} database).`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`ERROR: ${err.message}`)
    process.exit(1)
  })
}
