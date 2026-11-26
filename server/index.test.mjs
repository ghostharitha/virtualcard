import assert from 'node:assert/strict'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createApp } from './index.mjs'

test('account roles, card publication, edits and device sign-in', async t => {
  const server = await createApp({
    database: ':memory:',
    publicBase: 'https://cards.example.org',
    adminEmail: 'admin@example.org',
    adminPassword: 'initial admin password',
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const origin = 'http://127.0.0.1:' + server.address().port
  const device = randomUUID()
  const credentials = { email: 'member@example.org', password: 'a member password', device }
  const adminCredentials = { email: 'admin@example.org', password: 'initial admin password', device }
  async function request(path, { method = 'GET', input, session, status = 200 } = {}) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        ...(session && { Authorization: 'Bearer ' + session }),
        ...(input && { 'Content-Type': 'application/json' }),
      },
      body: input ? JSON.stringify(input) : undefined,
    })
    const data = (response.headers.get('content-type') ?? '').includes('application/json')
      ? await response.json() : await response.text()
    assert.equal(response.status, status, JSON.stringify(data))
    return data
  }
  const post = (path, input, status) => request(path, { method: 'POST', input, status })
  const put = (path, input, session, status) => request(path, { method: 'PUT', input, session, status })

  await post('/api/register', { ...adminCredentials, role: 'admin' }, 409)
  const member = await post('/api/register', { ...credentials, role: 'admin' })
  assert.equal(member.user.role, 'user')
  await post('/api/login', adminCredentials, 401)
  await post('/api/admin/login', credentials, 401)
  await request('/api/admin/users', { session: member.token, status: 403 })
  const admin = await post('/api/admin/login', adminCredentials)
  const adminList = await request('/api/admin/users', { session: admin.token })
  assert.equal(adminList.users[0].id, member.user.id)
  assert.equal(adminList.users[0].card, null)
  const cardEndpoint = '/api/admin/users/' + member.user.id + '/card'

  const details = {
    fullName: 'Alex <Example>', company: 'Studio & Co', jobTitle: 'Founder',
    category: 'Design', email: 'contact@example.org', phone: '+12 34',
    website: 'https://example.org/', linkedin: 'https://www.linkedin.com/in/alex',
    instagram: 'https://www.instagram.com/alex', about: 'First line\nSecond line, with punctuation.',
    photo: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString('base64'),
  }
  await put('/api/card', { details: { ...details, website: 'javascript:alert(1)' }, revision: 0 }, member.token, 400)
  const pending = await put('/api/card', { details, revision: 0 }, member.token)
  assert.equal(pending.card.status, 'pending')
  assert.equal(pending.card.publicUrl, null)
  const review = await request(cardEndpoint, { session: admin.token })
  assert.deepEqual(review.card.draft, details)
  const first = await put(cardEndpoint, { details: review.card.draft, revision: review.card.revision }, admin.token)
  const publicPath = new URL(first.card.publicUrl).pathname
  const html = await request(publicPath)
  assert.match(html, /Alex &lt;Example&gt;/)
  assert.match(html, /Studio &amp; Co/)
  assert.match(html, /mailto:contact@example\.org/)
  assert.match(await request(publicPath + '/contact.vcf'), /NOTE:First line\\nSecond line\\, with punctuation\./)
  const photo = await fetch(origin + publicPath + '/photo')
  assert.equal(photo.headers.get('content-type'), 'image/jpeg')
  assert.equal(Buffer.from(await photo.arrayBuffer()).toString('base64'), details.photo)

  const updates = { ...details, company: 'New company', photo: '' }
  const edited = await put('/api/card', { details: updates, revision: first.card.revision }, member.token)
  assert.equal(edited.card.status, 'updates_pending')
  assert.equal(edited.card.publicUrl, first.card.publicUrl)
  assert.doesNotMatch(await request(publicPath), /New company/)
  await put(cardEndpoint, { details, revision: first.card.revision }, admin.token, 409)
  const published = await put(cardEndpoint, { details: updates, revision: edited.card.revision }, admin.token)
  assert.equal(published.card.publicUrl, first.card.publicUrl)
  assert.match(await request(publicPath), /New company/)
  await request(publicPath + '/photo', { status: 404 })

  const newMember = await post('/api/register', { ...credentials, email: 'new@example.org' })
  const created = await put('/api/admin/users/' + newMember.user.id + '/card',
    { details, revision: 0 }, admin.token)
  assert.equal(created.card.status, 'published')
  assert.ok(created.card.publicUrl)

  const pin = '583109'
  const quickPin = await put('/api/quick-login', { kind: 'pin', pin, password: credentials.password }, member.token)
  const quickBio = await put('/api/quick-login', { kind: 'biometric', password: credentials.password }, member.token)
  await post('/api/quick-login', { key: quickPin.key, pin, device: randomUUID() }, 401)
  await post('/api/quick-login', { key: quickPin.key, pin: '000000', device }, 401)
  const unlocked = await post('/api/quick-login', { key: quickPin.key, pin, device })
  assert.equal(unlocked.user.id, member.user.id)
  assert.equal((await post('/api/quick-login', { key: quickBio.key, device })).user.id, member.user.id)
  await request('/api/logout', { method: 'POST', input: { forgetDevice: true }, session: unlocked.token })
  await request('/api/card', { session: member.token, status: 401 })
  await post('/api/quick-login', { key: quickPin.key, pin, device }, 401)
  await post('/api/quick-login', { key: quickBio.key, device }, 401)
})
