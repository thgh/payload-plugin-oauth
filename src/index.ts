import { str62 } from '@bothrs/util/random'
import OAuth2Strategy, { VerifyCallback } from 'passport-oauth2'
import payload from 'payload'
import { Config } from 'payload/config'
import session from 'express-session'
import passport from 'passport'
import { TextField } from 'payload/types'
import OAuthButton from './OAuthButton'
import type { oAuthPluginOptions } from './types'

export { OAuthButton, oAuthPluginOptions }

// Detect client side because some dependencies may be nullified
const CLIENTSIDE = typeof session !== 'function'

/**
 * Example for Wordpress:
 *
 * ```
 * export function mijnNederlandsAuth() {
 *   return oAuthPlugin({
 *     clientID: OAUTH_CLIENT_ID,
 *     clientSecret: OAUTH_CLIENT_SECRET,
 *     authorizationURL: OAUTH_SERVER + '/oauth/authorize',
 *     tokenURL: OAUTH_SERVER + '/oauth/token',
 *     callbackURL: ORIGIN + '/oauth/callback',
 *     scope: 'basic',
 *     async userinfo(accessToken) {
 *       const { data: user } = await axios.get(OAUTH_SERVER + '/oauth/me', {
 *         params: { access_token: accessToken },
 *       })
 *       return {
 *         sub: user.ID,
 *
 *         // Fields to fill in if user is created
 *         name: user.display_name || user.user_nicename || 'Nameless',
 *         email: user.user_email,
 *         role: user.capabilities?.administrator ? 'admin' : 'user',
 *       }
 *     },
 *   })
 * }
 * ```
 */
export const oAuthPlugin =
  (options: oAuthPluginOptions) =>
  (incoming: Config): Config => {
    // Shorthands
    const users = options.userCollection?.slug || 'users'
    const username = options.usernameField?.name || 'sub'
    const password = options.passwordField?.name || 'password'

    // Spread the existing config
    const config: Config = {
      ...incoming,
      collections: (incoming.collections || []).map((c) => {
        // Users must have a password field to be able to sign in
        if (
          c.slug === users &&
          !c.fields.some((f) => (f as TextField).name === password)
        ) {
          c.fields.push({
            name: password,
            type: 'text',
            admin: { hidden: true },
            access: { update: () => false },
          })
        }
        // Users must have a password field to be able to sign in
        if (
          c.slug === users &&
          !c.fields.some((f) => (f as TextField).name === username)
        ) {
          c.fields.push({
            name: username,
            type: 'text',
            admin: { readOnly: true },
            access: { update: () => false },
          })
        }
        return c
      }),
    }

    return CLIENTSIDE
      ? oAuthPluginClient(config, options)
      : oAuthPluginServer(config, options)
  }

function oAuthPluginClient(
  incoming: Config,
  options: oAuthPluginOptions
): Config {
  const button: React.ComponentType<any> =
    options.components?.Button || OAuthButton
  return {
    ...incoming,
    admin: {
      ...incoming.admin,
      components: {
        ...incoming.admin?.components,
        beforeLogin: [button].concat(
          incoming.admin?.components?.beforeLogin || []
        ),
      },
    },
  }
}

function oAuthPluginServer(
  incoming: Config,
  options: oAuthPluginOptions
): Config {
  // Shorthands
  const path =
    options.callbackPath ||
    (options.callbackURL && new URL(options.callbackURL).pathname) ||
    '/oauth2/callback'
  const slug = options.userCollection?.slug || 'users'
  const username = options.usernameField?.name || 'sub'
  const password = options.passwordField?.name || 'password'

  // Passport strategy
  const strategy = new OAuth2Strategy(
    options,
    async (
      accessToken: string,
      refreshToken: string,
      profile: {},
      cb: VerifyCallback
    ) => {
      try {
        // Get the userinfo
        const user = await options.userinfo?.(accessToken)
        if (!user) throw new Error('Failed to get userinfo')

        // Match existing user
        const users = await payload.find({
          collection: slug,
          where: { [username]: { equals: user[username as 'sub'] } },
        })
        if (users.docs && users.docs.length) {
          const user = users.docs[0]
          user.collection = slug
          user._strategy = 'oauth2'
          cb(null, user)
          return
        }

        // Register new user
        const registered = await payload.create({
          collection: slug,
          data: {
            ...user,
            // Stuff breaks when password is missing
            [password]: user.password || str62(20),
          },
        })
        registered.collection = slug
        registered._strategy = 'oauth2'
        cb(null, registered)
      } catch (error: any) {
        cb(error)
      }
    }
  )

  // Alternative?
  // strategy.userProfile = async (accessToken, cb) => {
  //   const user = await options.userinfo?.(accessToken)
  //   if (!user) cb(new Error('Failed to get userinfo'))
  //   else cb(null, user)
  // }

  passport.use(strategy)
  // passport.serializeUser((user: Express.User, done) => {
  passport.serializeUser((user: any, done) => {
    done(null, user.id)
  })
  passport.deserializeUser(async (id: string, done) => {
    const ok = await payload.findByID({ collection: 'user', id })
    done(null, ok)
  })

  return {
    ...incoming,
    admin: {
      ...incoming.admin,
      webpack: (webpackConfig) => {
        const config = incoming.admin?.webpack?.(webpackConfig) || {}
        return {
          ...config,
          resolve: {
            ...config.resolve,
            alias: {
              ...config.resolve?.alias,
              axios: false,
              'passport-oauth2': false,
              'express-session': false,
              passport: false,
            },
          },
        }
      },
    },
    endpoints: (incoming.endpoints || []).concat([
      {
        path: '/oauth2/*',
        method: 'get',
        root: true,
        handler: session({
          resave: false,
          saveUninitialized: false,
          secret: 'demo',
        }),
      },
      {
        path: '/oauth2/authorize',
        method: 'get',
        root: true,
        handler: passport.authenticate('oauth2', { state: 'aaa' }),
      },
      {
        path,
        method: 'get',
        root: true,
        handler: passport.authenticate('oauth2', {
          failureRedirect: '/admin/login',
        }),
      },
      {
        path,
        method: 'get',
        root: true,
        async handler(req, res) {
          await payload.login({
            req,
            res,
            collection: 'users',
            data: { email: req.user.email, password: req.user.password },
          })
          // Successful authentication, redirect home.
          res.redirect('/admin')
        },
      },
    ]),
  }
}
