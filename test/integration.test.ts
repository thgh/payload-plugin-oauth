import axios from 'axios'
import express from 'express'
import { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { spawn } from 'node:child_process'

const oauth = getOAuthProvider()
const app = getPayloadServer(oauth)

const oauth2 = getOAuthProvider()
const app2 = getPayloadServer(oauth2, { state: true })

test('sign in with state param', async () => {
  expect(app2.url).toMatch(/http:\/\/localhost:\d+/)

  const authorize = await axios.get(app2.url + '/oauth2/authorize', {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  expect(authorize.status).toBe(302)
  const cookies = getCookies(authorize.headers['set-cookie'])
  expect(cookies).toBeTruthy()

  const oauthAuthorize = authorize.headers.location
  expect(oauthAuthorize).toMatch(new RegExp('^' + oauth2.url + '/authorize'))
  const state = new URL(oauthAuthorize).searchParams.get('state')
  expect(state).toBeTruthy()

  const callbackResponse = await axios.get(oauthAuthorize, {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  const callback = callbackResponse.headers.location
  expect(callback).toMatch(/http:\/\/localhost:\d+\/callback/)
  expect(new URL(callback).searchParams.get('code')).toBe('testCode')
  expect(new URL(callback).searchParams.get('state')).toBe(state)

  const done = await axios.get(callback, {
    validateStatus: () => true,
    maxRedirects: 0,
    headers: { Cookie: cookies },
  })
  expect(done.status, callback).toBe(302)
  expect(done.headers.location).toBe('/admin')

  const decoded = decodePayloadToken(done.headers['set-cookie'])
  expect(decoded).toMatchObject({
    email: 'test@example.org',
    name: 'existing',
    collection: 'users',
  })
})

test('basic sign in', async () => {
  // Sanity check
  expect(app.url).toMatch(/http:\/\/localhost:\d+/)

  // Build authorize URL
  const authorize =
    oauth.url +
    '/authorize?' +
    new URLSearchParams({
      redirect_uri: app.url + '/callback',
      response_type: 'code',
      client_id: 'client_id',
    }).toString()
  const callbackResponse = await axios.get(authorize, {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  const callback = callbackResponse.headers.location

  // Authorize should redirect to callback URL with code
  expect(callback).toMatch(/http:\/\/localhost:\d+\/callback/)
  const code = new URL(callback).searchParams.get('code')
  expect(code).toBe('testCode')

  // Exchange code for cookie, redirecting to /admin
  const done = await axios.get(callback, {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  expect(done.status, callback).toBe(302)
  expect(done.headers.location).toBe('/admin')

  const decoded = decodePayloadToken(done.headers['set-cookie'])
  expect(decoded).toMatchObject({
    email: 'test@example.org',
    name: 'existing',
    collection: 'users',
  })
})

function getPayloadServer(oauth, options?: { state?: boolean }) {
  const port = Math.floor(Math.random() * 50000) + 10000
  const ctx: {
    url: string
    process: ReturnType<typeof spawn>
  } = {
    url: '',
    // @ts-expect-error
    process: null,
  }
  beforeAll(async () => {
    await oauth.ready
    await new Promise<string>((resolve) => {
      const dev = spawn('node', ['server.js'], {
        stdio: 'pipe',
        cwd: __dirname + '/payload',
        env: {
          ...process.env,
          PORT: '' + port,
          DEBUG: 'plugin:oauth:*',
          CLIENT_ID: 'client_id',
          CLIENT_SECRET: 'client_secret',
          AUTHORIZATION_URL: oauth.url + '/authorize',
          CALLBACK_URL: 'http://localhost:' + port + '/callback',
          TOKEN_URL: oauth.url + '/token',
          USERINFO_URL: oauth.url + '/userinfo',
          OAUTH_STATE: options?.state ? 'true' : '',
        },
      })
      dev.stdout.setEncoding('utf8')
      dev.stdout.on('data', (data) => {
        const line = data.toString().trim()
        if (line.startsWith('http://localhost:')) {
          ctx.url = line
          resolve(ctx.url)
        } else if (
          // Reduce clutter while showing unexpected output
          !line.includes('in-memory Mongo') &&
          !line.includes('webpack') &&
          !line.includes('Starting Payload')
        ) {
          console.log('dev.stdout', data.toString())
        }
      })

      dev.stderr.setEncoding('utf8')
      dev.stderr.on('data', (data) => {
        console.log('dev.stderr', data.toString())
      })

      ctx.process = dev
    })
  }, 30000)
  afterAll(async () => {
    ctx.process.kill()
  })

  return ctx
}

function getOAuthProvider() {
  const ctx: {
    url: string
    server: Server
    ready: Promise<Server>
  } = {
    url: '',
    // @ts-expect-error
    server: null,
    // @ts-expect-error
    ready: null,
  }
  beforeAll(async () => {
    ctx.ready = new Promise<Server>((resolve) => {
      const app = express()
      app.use(express.json())
      app.use(express.urlencoded({ extended: true }))
      app.get('/authorize', (req, res) => {
        if (req.query.response_type !== 'code')
          return res
            .status(400)
            .json({ error: 'invalid_request', query: req.query })
        if (req.query.client_id !== 'client_id')
          return res
            .status(400)
            .json({ error: 'invalid_client', query: req.query })
        if (!req.query.redirect_uri)
          return res
            .status(400)
            .json({ error: 'invalid_redirect_uri', query: req.query })
        const params = new URLSearchParams({ code: 'testCode' })
        if (req.query.state) params.set('state', String(req.query.state))
        const to = req.query.redirect_uri + '?' + params.toString()
        // console.log('authorize.redirect', to)
        res.redirect(to)
      })
      app.use('/token', (req, res) => {
        // console.log('token', req.body, req.query)
        res.json({
          access_token: 'a',
          refresh_token: 'r',
          token_type: 'bearer',
          expires_in: 3600,
        })
      })
      app.use('/userinfo', (req, res) => {
        if (req.headers.authorization !== 'Bearer a')
          return res.status(401).json({ error: 'invalid_token' })
        res.json({
          sub: 'existing_sub',
        })
      })
      app.get('/callback', async (req, res) => {
        console.log('callback on wrong server', req.query)
        res.json(req.query)
      })
      app.use((req, res) => {
        console.log('oauth 404', req.url)
        res.status(404).json({ url: req.url })
      })
      ctx.server = app.listen(0, () => resolve(ctx.server))
    })

    const server = await ctx.ready

    // Start server
    const address = server.address()
    if (typeof address === 'string') ctx.url = address
    else if (address) ctx.url = 'http://localhost:' + address.port
  })
  afterAll(async () => {
    // Close server
    ctx.server.close()
  })

  return ctx
}

function getCookies(setCookie: string[] | undefined) {
  if (!setCookie?.length) return ''
  return setCookie.map((c) => c.split(';')[0]).join('; ')
}

function decodePayloadToken(setCookie: string[] | undefined) {
  const token = setCookie
    ?.find((c) => c.startsWith('payload-token='))
    ?.split(';')[0]
    .split('=')[1]
    .split('.')[1]
  if (!token) return {}
  return JSON.parse(Buffer.from(token, 'base64').toString())
}
