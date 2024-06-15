import { type SessionOptions } from 'express-session'
import type {
  StrategyOptions,
  StrategyOptionsWithRequest,
} from 'passport-oauth2'
import { Request } from 'express'
import type { ComponentType } from 'react'

interface BaseOAuthPluginOptions {
  /** Database connection URI in case the lib needs access to database */
  databaseUri: string

  /** Options to pass to express-session
   * @default
   * ```js
   * {
   *    resave: false,
   *    saveUninitialized: false,
   *    secret: process.env.PAYLOAD_SECRET,
   *    store: options.databaseUri
   *        ? MongoStore.create({ mongoUrl: options.databaseUri })
   *        : undefined,
   * }),
   * ```
   *
   */
  sessionOptions?: SessionOptions

  /** Endpoint to handle callback from oauth provider
   * Defaults to /oauth/authorize
   * Note that this will have /api prepended to it.
   * So the default value is actually /api/oauth/authorize
   *
   * @default /oauth/authorize
   */
  authorizePath?: string

  /** Map an authentication result to a user */
  userinfo: (
    accessToken: string,
    refreshToken?: string,
    req?: Request
  ) => Promise<{
    /** Unique identifier for the linked account */
    sub: string
    /** Unique identifier for the linked account */
    email?: string
    /** A password will be generated for new users */
    password?: string
    /** Example of a custom field */
    name?: string
  }>

  /** Which path to mount in express, defaults to the path in callbackURL */
  callbackPath?: string

  /**
   * Text on the sign in button
   * @default "Sign in with oAuth"
   */
  buttonLabel?: string

  components?: {
    Button?: false | ((props: ButtonProps) => JSX.Element)
  }
  userCollection?: {
    /** @default "users" */
    slug?: string
  }
  /** If the collection does not have a field with name "sub", it will be created */
  subField?: {
    /** @default "sub" */
    name?: string
  }
  /** Path or URL to redirect the authenticated user to
   * @default /admin
   */
  successRedirect?: string
}

export interface oAuthPluginOptions
  extends BaseOAuthPluginOptions,
    StrategyOptions {}

export interface oAuthPluginOptionsWithRequest
  extends BaseOAuthPluginOptions,
    StrategyOptionsWithRequest {
  /**
   * With this option enabled, req will be passed as the first argument to the verify callback.
   * @default true
   */
  passReqToCallback: true
}
export type ButtonProps = {
  /** Path that initiates the oAuth flow */
  authorizePath: string
  /** Text on the sign in button */
  buttonLabel: string
}
