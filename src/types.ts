import type { StrategyOptions } from 'passport-oauth2'
import type { ComponentType } from 'react'

export interface oAuthPluginOptions extends StrategyOptions {
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
  usernameField?: {
    /** Defaults to "sub" */
    name?: string
  }
  passwordField?: {
    /** Defaults to "password" */
    name?: string
  }
}
