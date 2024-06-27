import { str62 } from '@bothrs/util/random'
import MongoStore from 'connect-mongo'
import session from 'express-session'
import jwt from 'jsonwebtoken'
import passport from 'passport'
import OAuth2Strategy, { VerifyCallback } from 'passport-oauth2'
import debug from 'debug'
import payload from 'payload'
import { Request } from 'express'
import { Config } from 'payload/config'
import {
  Field,
  fieldAffectsData,
  fieldHasSubFields,
} from 'payload/dist/fields/config/types'
import { PaginatedDocs } from 'payload/dist/database/types'
import getCookieExpiration from 'payload/dist/utilities/getCookieExpiration'
import { PayloadRequest, TextField } from 'payload/types'

import OAuthButton from './OAuthButton'
import type { oAuthPluginOptions, oAuthPluginOptionsWithRequest } from './types'
import { createElement } from 'react'

export { OAuthButton, oAuthPluginOptions, oAuthPluginOptionsWithRequest }

interface User {
  id: string | number
}

const log = debug('plugin:oauth')

// Detect client side because some dependencies may be nullified
const CLIENTSIDE = typeof session !== 'function'

/**
 * Example for Wordpress:
 *
 * ```
 * export function mijnNederlandsAuth() {
 *   return oAuthPlugin({
 *     databaseUri: process.env.MONGO_URL,
 *     clientID: process.env.OAUTH_CLIENT_ID,
 *     clientSecret: process.env.OAUTH_CLIENT_SECRET,
 *     authorizationURL: process.env.OAUTH_SERVER + '/oauth/authorize',
 *     tokenURL: process.env.OAUTH_SERVER + '/oauth/token',
 *     callbackURL: process.env.ORIGIN + '/oauth/callback',
 *     scope: 'basic',
 *     async userinfo(accessToken) {
 *       const { data: user } = await axios.get(process.env.OAUTH_SERVER + '/oauth/me', {
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
  (options: oAuthPluginOptions | oAuthPluginOptionsWithRequest) =>
  (incoming: Config): Config => {
    // Shorthands
    const collectionSlug = options.userCollection?.slug || 'users'
    const sub = options.subField?.name || 'sub'

    // Spread the existing config
    const config: Config = {
      ...incoming,
      collections: (incoming.collections || []).map((c) => {
        // Let's track the oAuth id (sub)
        if (
          c.slug === collectionSlug &&
          !c.fields.some((f) => (f as TextField).name === sub)
        ) {
          c.fields.push({
            name: sub,
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
  options: oAuthPluginOptions | oAuthPluginOptionsWithRequest
): Config {
  const button = options.components?.Button ?? OAuthButton
  return button
    ? {
        ...incoming,
        admin: {
          ...incoming.admin,
          components: {
            ...incoming.admin?.components,
            beforeLogin: (incoming.admin?.components?.beforeLogin || []).concat(
              () =>
                createElement(button, {
                  authorizePath: options.authorizePath || '/oauth2/authorize',
                  buttonLabel: options.buttonLabel || `Sign in with oAuth`,
                })
            ),
          },
        },
      }
    : incoming
}

function oAuthPluginServer(
  incoming: Config,
  options: oAuthPluginOptions | oAuthPluginOptionsWithRequest
): Config {
  // Shorthands
  const callbackPath =
    options.callbackPath ||
    (options.callbackURL && new URL(options.callbackURL).pathname) ||
    '/oauth2/callback'
  const authorizePath = options.authorizePath ?? '/oauth2/authorize'
  const collectionSlug = (options.userCollection?.slug as 'users') || 'users'
  const sub = options.subField?.name || 'sub'
  const oAuthStrategyCount = (incoming.custom?.oAuthStrategyCount || 0) + 1
  const strategyName = `oauth2-${oAuthStrategyCount}`

  if (options.clientID) {
    // Validate paths, they must be unique
    const oAuthPaths = incoming.custom?.oAuthPaths || new Set()
    if (oAuthPaths.has(authorizePath))
      throw new Error(
        `Choose a unique authorizePath for oAuth strategy ${oAuthStrategyCount} (not ${options.authorizePath})`
      )
    oAuthPaths.add(authorizePath)
    if (oAuthPaths.has(callbackPath))
      throw new Error(
        `Choose a unique callbackPath for oAuth strategy ${oAuthStrategyCount} (not ${options.callbackPath})`
      )
    async function verifyCallback(
      accessToken: string,
      refreshToken: string,
      profile: {},
      cb: VerifyCallback,
      options: any, // Adjust type of options as needed
      req?: Request // Optional request parameter
    ): Promise<any> {
      let info: {
        sub: string
        email?: string
        password?: string
        name?: string
      }
      let user: User & { collection?: any; _strategy?: any }
      let users: PaginatedDocs<User>

      try {
        // Get the userinfo
        info = await options.userinfo?.(accessToken, refreshToken, req)
        if (!info) throw new Error('Failed to get userinfo')

        // Match existing user
        users = await payload.find({
          collection: collectionSlug,
          where: { [sub]: { equals: info[sub as 'sub'] } },
          showHiddenFields: true,
        })

        // Connect user to current login profile if already authenticated
        if (req?.user && (req as PayloadRequest).user.id) {
          await payload.update({
            collection: collectionSlug,
            id: (req as PayloadRequest).user.id,
            data: {
              ...info,
              showHiddenFields: true,
            },
          })
          log('connect.user', req.user)
          return cb(null, req.user)
        } else if (users.docs && users.docs.length) {
          // User exists
          user = users.docs[0]
          if (options.updateOnLogin) {
            user = await payload.update({
              collection: collectionSlug,
              id: user.id,
              data: info,
              showHiddenFields: true,
            })
          }
          user.collection = collectionSlug
          user._strategy = strategyName
        } else {
          // Register new user
          user = await payload.create({
            collection: collectionSlug,
            data: {
              ...info,
              // Stuff breaks when password is missing
              password: info.password || str62(20),
            },
            showHiddenFields: true,
          })
          log('signin.user', user)
          user.collection = collectionSlug
          user._strategy = strategyName
        }

        cb(null, user)
      } catch (error: any) {
        log('signin.fail', error.message, error.trace)
        cb(error)
      }
    }

    // Passport strategy
    let strategy: OAuth2Strategy

    if ('passReqToCallback' in options && options.passReqToCallback) {
      strategy = new OAuth2Strategy(options, async function (
        req: Request,
        accessToken: string,
        refreshToken: string,
        profile: {},
        cb: VerifyCallback
      ) {
        await verifyCallback(
          accessToken,
          refreshToken,
          profile,
          cb,
          options,
          req
        )
      })
    } else {
      strategy = new OAuth2Strategy(options, async function (
        accessToken: string,
        refreshToken: string,
        profile: {},
        cb: VerifyCallback
      ) {
        await verifyCallback(accessToken, refreshToken, profile, cb, options)
      })
    }
    // Alternative?
    // strategy.userProfile = async (accessToken, cb) => {
    //   const user = await options.userinfo?.(accessToken)
    //   if (!user) cb(new Error('Failed to get userinfo'))
    //   else cb(null, user)
    // }

    passport.use(strategyName, strategy)
    // passport.serializeUser((user: Express.User, done) => {
    passport.serializeUser((user: any, done) => {
      done(null, user.id)
    })
    passport.deserializeUser(async (id: string, done) => {
      const ok = await payload.findByID({ collection: collectionSlug, id })
      done(null, ok)
    })
  } else {
    console.warn('No client id, oauth disabled')
  }

  return {
    ...incoming,
    custom: { ...incoming.custom, oAuthStrategyCount },
    admin: {
      ...incoming.admin,
      webpack: (webpackConfig) => {
        const config = incoming.admin?.webpack?.(webpackConfig) || webpackConfig
        return {
          ...config,
          resolve: {
            ...config.resolve,
            alias: {
              ...config.resolve?.alias,
              'connect-mongo': false,
              'express-session': false,
              'passport-oauth2': false,
              jsonwebtoken: false,
              passport: false,
            },
          },
        }
      },
    },
    endpoints: (incoming.endpoints || []).concat([
      {
        path: authorizePath,
        method: 'get',
        root: true,
        handler: passport.authenticate(strategyName),
      },
      {
        path: callbackPath,
        method: 'get',
        root: true,
        handler: session(
          options.sessionOptions ?? {
            resave: false,
            saveUninitialized: false,
            secret:
              process.env.PAYLOAD_SECRET ||
              log('Missing process.env.PAYLOAD_SECRET') ||
              'unsafe',
            store: options.databaseUri
              ? MongoStore.create({ mongoUrl: options.databaseUri })
              : undefined,
          }
        ),
      },
      {
        path: callbackPath,
        method: 'get',
        root: true,
        handler: passport.authenticate(strategyName, { failureRedirect: '/' }),
      },
      {
        path: callbackPath,
        method: 'get',
        root: true,
        async handler(req, res) {
          // Get the Mongoose user
          const collectionConfig = payload.collections[collectionSlug].config

          // Sanitize the user object
          // let user = userDoc.toJSON({ virtuals: true })
          let user = JSON.parse(JSON.stringify(req.user))

          // Decide which user fields to include in the JWT
          const fieldsToSign = collectionConfig.fields.reduce(
            (signedFields, field: Field) => {
              const result = {
                ...signedFields,
              }

              if (!fieldAffectsData(field) && fieldHasSubFields(field)) {
                field.fields.forEach((subField) => {
                  if (fieldAffectsData(subField) && subField.saveToJWT) {
                    result[subField.name] = user[subField.name]
                  }
                })
              }

              if (fieldAffectsData(field) && field.saveToJWT) {
                result[field.name] = user[field.name]
              }

              return result
            },
            {
              email: user.email,
              id: user.id,
              collection: collectionConfig.slug,
            } as any
          )

          // Sign the JWT
          const token = jwt.sign(fieldsToSign, payload.secret, {
            expiresIn: collectionConfig.auth.tokenExpiration,
          })

          // Set cookie
          res.cookie(`${payload.config.cookiePrefix}-token`, token, {
            path: '/',
            httpOnly: true,
            expires: getCookieExpiration(collectionConfig.auth.tokenExpiration),
            secure: collectionConfig.auth.cookies.secure,
            sameSite: collectionConfig.auth.cookies.sameSite,
            domain: collectionConfig.auth.cookies.domain || undefined,
          })

          // Redirect to the defined path or default to the admin dashboard
          res.redirect(options.successRedirect || '/admin')
        },
      },
    ]),
  }
}
