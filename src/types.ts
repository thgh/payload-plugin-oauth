import {type SessionOptions }from 'express-session'
import type { StrategyOptions } from 'passport-oauth2'
import type { ComponentType } from 'react'

export interface oAuthPluginOptions extends StrategyOptions {
  /** Database connection URI in case the lib needs access to database */
  databaseUri: string

  /** Custom express-session options
   * Defaults to:
   * {
   *    resave: false,
   *    saveUninitialized: false,
   *    secret: process.env.PAYLOAD_SECRET,
   *    store: options.databaseUri
   *        ? MongoStore.create({ mongoUrl: options.databaseUri })
   *        : undefined,
   * }),
   * 
   */
  sessionOptions?: SessionOptions

  /** Custom endpoint to handle callback from oauth provider
   * Defaults to /oauth/authorize
   * Note that this will have /api prepended to it.
   * So the default value is actually /api/oauth/authorize
  */
  customAuthorizePath?: string

  /** Map an authentication result to a user */
  userinfo: (accessToken: string) => Promise<{
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

  components?: {
    Button?: ComponentType<any>
  }
  userCollection?: {
    /** Defaults to "users" */
    slug?: string
  }
  /** If the collection does not have a field with name "sub", it will be created */
  subField?: {
    /** Defaults to "sub" */
    name?: string
  }
}
