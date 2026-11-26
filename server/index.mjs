import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { cardPage, vcard } from './card.mjs'

const derive = promisify(scrypt)
const token = () => randomBytes(32).toString('base64url')
const hashToken = value => createHash('sha256').update(value).digest('hex')
const day = 86_400_000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const pinPattern = /^\d{6}$/
const devicePattern = /^[a-f0-9-]{36}$/
const tokenPattern = /^[A-Za-z0-9_-]{43}$/
const limits = {
  fullName: 100, jobTitle: 100, company: 120, category: 80, email: 254,
  phone: 45, website: 300, linkedin: 300, instagram: 300, about: 800,
}

class RequestError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function hashSecret(value) {
  const salt = randomBytes(16).toString('hex')
  const hash = await derive(value, salt, 64)
  return salt + ':' + hash.toString('hex')
}

async function verifySecret(value, stored) {
  const [salt, hex] = stored.split(':')
  const hash = await derive(value, salt, 64)
  return timingSafeEqual(hash, Buffer.from(hex, 'hex'))
}

function reply(res, status, data, contentType = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...headers,
  })
  res.end(contentType.startsWith('application/json') ? JSON.stringify(data) : data)
}

async function body(req) {
  let length = 0
  const chunks = []
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    length += chunk.length
    if (length > 1_550_000) {
      req.resume()
      throw new RequestError(413, 'The uploaded photo is too large.')
    }
    chunks.push(chunk)
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error()
    return data
  } catch {
    throw new RequestError(400, 'Invalid request data.')
  }
}

function emailValue(input) {
  return typeof input === 'string' ? input.trim().toLowerCase() : ''
}

function isEmail(value) {
  return value.length <= 254 && emailPattern.test(value)
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128
}

function cleanCard(input) {
  const details = {}
  for (const [key, max] of Object.entries(limits)) {
    const value = typeof input[key] === 'string' ? input[key].trim() : ''
    if (value.length > max) throw new RequestError(400, 'One of the card fields is too long.')
    details[key] = value
  }
  if (!details.fullName) throw new RequestError(400, 'Enter your full name.')
  if (details.email && !isEmail(details.email)) throw new RequestError(400, 'Enter a valid contact email.')
  if (details.phone && (!/^\+?[\d ().-]+$/.test(details.phone) || !/\d/.test(details.phone))) {
    throw new RequestError(400, 'Enter a valid phone number.')
  }
  for (const key of ['website', 'linkedin', 'instagram']) {
    if (!details[key]) continue
    try {
      const url = new URL(details[key])
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error()
      details[key] = url.href
    } catch {
      throw new RequestError(400, 'Enter full links beginning with https:// or http://.')
    }
  }
  details.photo = typeof input.photo === 'string' ? input.photo : ''
  if (details.photo) {
    if (details.photo.length > 1_400_000 || !/^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(details.photo)) {
      throw new RequestError(400, 'Select a JPEG photo under 1 MB.')
    }
    const bytes = Buffer.from(details.photo, 'base64')
    if (bytes.length < 5 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
      throw new RequestError(400, 'Select a valid JPEG photo.')
    }
  }
  return details
}

export async function createApp({ database, publicBase, adminEmail, adminPassword }) {
  const base = new URL(publicBase)
  if (!['http:', 'https:'].includes(base.protocol) || base.href !== base.origin + '/') {
    throw new Error('PUBLIC_BASE_URL must be an HTTP or HTTPS origin without a path.')
  }
  if (!isEmail(adminEmail) || (adminPassword && !validPassword(adminPassword))) {
    throw new Error('Set a valid ADMIN_EMAIL and use at least 10 characters for ADMIN_PASSWORD.')
  }
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true })
  const db = new DatabaseSync(database)
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(
    'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), device TEXT NOT NULL, expires INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS quick_login (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, device TEXT NOT NULL, pin TEXT, expires INTEGER NOT NULL, UNIQUE(user_id, device, kind));' +
    'CREATE TABLE IF NOT EXISTS cards (user_id TEXT PRIMARY KEY REFERENCES users(id), slug TEXT UNIQUE NOT NULL, draft TEXT NOT NULL, published TEXT, revision INTEGER NOT NULL, published_revision INTEGER, updated_at INTEGER NOT NULL);' +
    'CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);',
  )
  const existing = db.prepare("SELECT id FROM users WHERE email = ? AND role = 'admin'").get(adminEmail)
  if (!existing && !adminPassword) {
    db.close()
    throw new Error('Set ADMIN_PASSWORD before starting the server for the first time.')
  }
  if (!existing) {
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(randomUUID(), adminEmail, await hashSecret(adminPassword), 'admin', Date.now())
  }
  const dummyHash = await hashSecret(token())
  const userByEmail = db.prepare('SELECT * FROM users WHERE email = ?')
  const userCard = db.prepare('SELECT * FROM cards WHERE user_id = ?')

  function throttle(key, max, duration) {
    const now = Date.now()
    const row = db.prepare('SELECT count, until FROM attempts WHERE key = ?').get(key)
    if (row?.until > now && row.count >= max) throw new RequestError(429, 'Too many attempts. Try again later.')
    db.prepare('INSERT OR REPLACE INTO attempts VALUES (?, ?, ?)').run(
      key, row?.until > now ? row.count + 1 : 1, row?.until > now ? row.until : now + duration,
    )
  }

  function cardMetadata(row) {
    if (!row) return null
    const pending = row.revision !== row.published_revision
    return {
      status: pending ? (row.published ? 'updates_pending' : 'pending') : 'published',
      revision: row.revision,
      publicUrl: row.published ? base.origin + '/c/' + row.slug : null,
      updatedAt: row.updated_at,
    }
  }

  function cardView(row) {
    if (!row) return null
    return {
      ...cardMetadata(row),
      draft: JSON.parse(row.draft),
      published: row.published ? JSON.parse(row.published) : null,
    }
  }

  function signIn(res, user, device) {
    const session = token()
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hashToken(session), user.id, device, Date.now() + day)
    reply(res, 200, { token: session, user: { id: user.id, email: user.email, role: user.role } })
  }

  function getSession(req) {
    const supplied = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
    const session = supplied && db.prepare(
      'SELECT users.*, sessions.device FROM sessions JOIN users ON users.id = sessions.user_id WHERE hash = ? AND expires > ?',
    ).get(hashToken(supplied), Date.now())
    if (!session) throw new RequestError(401, 'Sign in to continue.')
    return session
  }

  function saveCard(userId, input, publish) {
    const prior = userCard.get(userId)
    if (input.revision !== (prior?.revision ?? 0)) {
      throw new RequestError(409, 'This card changed while you were editing. Reload it before saving.')
    }
    const details = JSON.stringify(cleanCard(input.details ?? {}))
    const revision = (prior?.revision ?? 0) + 1
    db.prepare('INSERT OR REPLACE INTO cards VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      userId, prior?.slug ?? randomBytes(16).toString('base64url'), details,
      publish ? details : prior?.published ?? null,
      revision, publish ? revision : prior?.published_revision ?? null, Date.now(),
    )
    return cardView(userCard.get(userId))
  }

  const server = createServer(async (req, res) => {
    const method = req.method
    try {
      const path = new URL(req.url, base).pathname
      const ip = req.socket.remoteAddress
      if (method === 'GET' && path === '/health') return reply(res, 200, { status: 'ok' })
      const publicCard = path.match(/^\/c\/([A-Za-z0-9_-]{22})(\/photo|\/contact\.vcf)?$/)
      if (method === 'GET' && publicCard) {
        const [, slug, part] = publicCard
        const row = db.prepare('SELECT published FROM cards WHERE slug = ? AND published IS NOT NULL').get(slug)
        if (!row) return reply(res, 404, 'This card is unavailable.', 'text/plain; charset=utf-8')
        const details = JSON.parse(row.published)
        if (part === '/photo') {
          if (!details.photo) return reply(res, 404, 'Photo unavailable.', 'text/plain; charset=utf-8')
          return reply(res, 200, Buffer.from(details.photo, 'base64'), 'image/jpeg')
        }
        if (part === '/contact.vcf') {
          return reply(res, 200, vcard(details), 'text/vcard; charset=utf-8', {
            'Content-Disposition': 'attachment; filename="contact.vcf"',
          })
        }
        return reply(res, 200, cardPage(details, '/c/' + slug + '/photo', '/c/' + slug + '/contact.vcf'), 'text/html; charset=utf-8', {
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        })
      }

      if (method === 'POST' && ['/api/register', '/api/login', '/api/admin/login'].includes(path)) {
        const registering = path === '/api/register'
        throttle('ip:' + ip, 60, 60_000)
        const input = await body(req)
        const email = emailValue(input.email)
        if (!isEmail(email) || typeof input.password !== 'string' || input.password.length > 128 ||
            typeof input.device !== 'string' || !devicePattern.test(input.device)) {
          throw new RequestError(400, 'Enter a valid email and password.')
        }
        throttle('email:' + email, 10, 15 * 60_000)
        const user = userByEmail.get(email)
        if (registering) {
          if (!validPassword(input.password)) throw new RequestError(400, 'Use a password of 10 to 128 characters.')
          if (user) throw new RequestError(409, 'An account already uses this email.')
          const password = await hashSecret(input.password)
          const result = db.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)').run(
            randomUUID(), email, password, 'user', Date.now(),
          )
          if (!result.changes) throw new RequestError(409, 'An account already uses this email.')
          db.prepare('DELETE FROM attempts WHERE key = ?').run('email:' + email)
          return signIn(res, userByEmail.get(email), input.device)
        }
        const correct = await verifySecret(input.password, user?.password ?? dummyHash)
        const role = path === '/api/admin/login' ? 'admin' : 'user'
        if (!correct || user?.role !== role) throw new RequestError(401, 'The email or password is incorrect.')
        db.prepare('DELETE FROM attempts WHERE key = ?').run('email:' + email)
        return signIn(res, user, input.device)
      }

      if (method === 'POST' && path === '/api/quick-login') {
        throttle('ip:' + ip, 60, 60_000)
        const { key, pin, device } = await body(req)
        if (typeof key !== 'string' || !tokenPattern.test(key)) throw new RequestError(401, 'Sign in with your password.')
        const hash = hashToken(key)
        const user = db.prepare(
          'SELECT users.*, quick_login.kind, quick_login.pin, quick_login.device FROM quick_login JOIN users ON users.id = quick_login.user_id WHERE hash = ? AND expires > ?',
        ).get(hash, Date.now())
        if (!user || device !== user.device) throw new RequestError(401, 'Sign in with your password to set up quick sign-in again.')
        if (user.kind === 'pin') {
          if (typeof pin !== 'string' || !pinPattern.test(pin)) throw new RequestError(400, 'Enter your six-digit PIN.')
          throttle('pin:' + hash, 5, 15 * 60_000)
          if (!await verifySecret(pin + key, user.pin)) throw new RequestError(401, 'Incorrect PIN.')
          db.prepare('DELETE FROM attempts WHERE key = ?').run('pin:' + hash)
        }
        // A sign-out may have completed during PIN verification.
        if (!db.prepare('SELECT 1 FROM quick_login WHERE hash = ?').get(hash)) {
          throw new RequestError(401, 'Sign in with your password.')
        }
        return signIn(res, user, device)
      }

      if (!path.startsWith('/api/')) return reply(res, 404, 'Page not found.', 'text/plain; charset=utf-8')
      const user = getSession(req)
      if (method === 'POST' && path === '/api/logout') {
        const { forgetDevice } = await body(req)
        if (forgetDevice === true) {
          db.prepare('DELETE FROM quick_login WHERE user_id = ? AND device = ?').run(user.id, user.device)
          db.prepare('DELETE FROM sessions WHERE user_id = ? AND device = ?').run(user.id, user.device)
        } else {
          db.prepare('DELETE FROM sessions WHERE hash = ?').run(hashToken(req.headers.authorization.slice(7)))
        }
        return reply(res, 200, {})
      }
      if (method === 'PUT' && path === '/api/quick-login') {
        if (user.role !== 'user') throw new RequestError(403, 'Use the admin password to sign in.')
        throttle('setup:' + user.id, 8, 15 * 60_000)
        const { kind, pin, password } = await body(req)
        if (!['pin', 'biometric'].includes(kind) || (kind === 'pin' && (typeof pin !== 'string' || !pinPattern.test(pin)))) {
          throw new RequestError(400, 'Enter a six-digit PIN.')
        }
        if (!validPassword(password) || !await verifySecret(password, user.password)) {
          throw new RequestError(401, 'The account password is incorrect.')
        }
        const key = token()
        const pinHash = kind === 'pin' ? await hashSecret(pin + key) : null
        getSession(req)
        db.prepare('INSERT OR REPLACE INTO quick_login VALUES (?, ?, ?, ?, ?, ?)').run(
          hashToken(key), user.id, kind, user.device, pinHash, Date.now() + 30 * day,
        )
        db.prepare('DELETE FROM attempts WHERE key = ?').run('setup:' + user.id)
        return reply(res, 200, { key })
      }
      if (method === 'GET' && path === '/api/card' && user.role === 'user') {
        return reply(res, 200, { card: cardView(userCard.get(user.id)) })
      }
      if (method === 'PUT' && path === '/api/card' && user.role === 'user') {
        const input = await body(req)
        getSession(req)
        return reply(res, 200, { card: saveCard(user.id, input, false) })
      }
      if (path.startsWith('/api/admin/') && user.role !== 'admin') throw new RequestError(403, 'Admin access required.')
      if (method === 'GET' && path === '/api/admin/users') {
        const after = new URL(req.url, base).searchParams.get('after') ?? ''
        const rows = db.prepare(
          "SELECT users.id, users.email, cards.slug, cards.revision, cards.published_revision, cards.updated_at, " +
          "cards.published IS NOT NULL AS published, json_extract(cards.draft, '$.fullName') AS fullName " +
          "FROM users LEFT JOIN cards ON cards.user_id = users.id " +
          "WHERE users.role = 'user' AND users.email > ? ORDER BY users.email LIMIT 51",
        ).all(after)
        const users = rows.slice(0, 50).map(row => ({
          id: row.id,
          email: row.email,
          card: row.slug ? { ...cardMetadata(row), fullName: row.fullName } : null,
        }))
        return reply(res, 200, { users, next: rows.length > 50 ? users.at(-1).email : null })
      }
      const adminCard = path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/card$/)
      if (adminCard && ['GET', 'PUT'].includes(method)) {
        const target = db.prepare("SELECT id, email FROM users WHERE role = 'user' AND id = ?").get(adminCard[1])
        if (!target) throw new RequestError(404, 'Account not found.')
        if (method === 'GET') return reply(res, 200, { user: target, card: cardView(userCard.get(target.id)) })
        const input = await body(req)
        getSession(req)
        return reply(res, 200, { card: saveCard(target.id, input, true) })
      }
      throw new RequestError(404, 'This action is unavailable.')
    } catch (error) {
      if (error instanceof RequestError) return reply(res, error.status, { error: error.message })
      console.error(error)
      return reply(res, 500, { error: 'The server could not complete this action.' })
    }
  })
  const cleanup = setInterval(() => {
    const now = Date.now()
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now)
    db.prepare('DELETE FROM quick_login WHERE expires <= ?').run(now)
    db.prepare('DELETE FROM attempts WHERE until <= ?').run(now)
  }, 60 * 60_000).unref()
  server.once('close', () => {
    clearInterval(cleanup)
    db.close()
  })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 8787)
  const server = await createApp({
    database: resolve(process.env.DATABASE_PATH ?? 'data/tapfolio.sqlite'),
    publicBase: process.env.PUBLIC_BASE_URL ?? 'http://localhost:' + port,
    adminEmail: emailValue(process.env.ADMIN_EMAIL),
    adminPassword: process.env.ADMIN_PASSWORD,
  })
  server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log('Tapfolio is listening on port ' + port))
}
