import axios from 'axios'
import express from 'express'
import { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { spawn } from 'node:child_process'

const oauth = getOAuthProvider()
const app = getPayloadServer(oauth)

test('basic sign in', async () => {
  // Sanity check
  expect(app.url).toMatch(/http:\/\/localhost:\d+/)

  // Build authorize URL
  const authorize =
    oauth.url +
    '/authorize?' +
    new URLSearchParams({
      redirect_uri: app.url + '/oauth2/callback',
      response_type: 'code',
      client_id: 'client_id',
    }).toString()
  const callbackResponse = await axios.get(authorize, {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  const callback = callbackResponse.headers.location

  // Authorize should redirect to callback URL with code
  expect(callback).toMatch(/http:\/\/localhost:\d+\/oauth2\/callback/)
  const code = new URL(callback).searchParams.get('code')
  expect(code).toBe('testCode')

  // Exchange code for cookie, redirecting to /admin
  const done = await axios.get(callback, {
    validateStatus: () => true,
    maxRedirects: 0,
  })
  expect(done.status, callback).toBe(302)
  expect(done.headers.location).toBe('/admin')

  // Validate cookie contents
  let decoded: any = {}
  try {
    decoded = done.headers['set-cookie']
    decoded = decoded.find((c) => c.startsWith('payload-token='))
    decoded = decoded.split(';')[0].split('=')[1].split('.')[1]
    decoded = JSON.parse(Buffer.from(decoded, 'base64').toString())
  } catch (error) {
    console.log('decoded', decoded)
  }
  expect(decoded).toMatchObject({
    email: 'test@example.org',
    name: 'existing',
    collection: 'users',
  })
})

function getPayloadServer(oauth) {
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
      const dev = spawn('bun', ['server.ts'], {
        stdio: 'pipe',
        cwd: __dirname + '/payload',
        env: {
          ...process.env,
          DEBUG: 'plugin:oauth:*',
          CLIENT_ID: 'client_id',
          CLIENT_SECRET: 'client_secret',
          AUTHORIZATION_URL: oauth.url + '/authorize',
          TOKEN_URL: oauth.url + '/token',
          USERINFO_URL: oauth.url + '/userinfo',
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
        const to = req.query.redirect_uri + '?code=testCode'
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
