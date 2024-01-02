# oAuth plugin for Payload CMS

<a href="LICENSE">
  <img src="https://img.shields.io/badge/license-MIT-brightgreen.svg" alt="Software License" />
</a>
<a href="https://github.com/thgh/payload-plugin-oauth/issues">
  <img src="https://img.shields.io/github/issues/thgh/payload-plugin-oauth.svg" alt="Issues" />
</a>
<a href="https://npmjs.org/package/payload-plugin-oauth">
  <img src="https://img.shields.io/npm/v/payload-plugin-oauth.svg?style=flat-squar" alt="NPM" />
</a>

## Features

- Configures passport-oauth2
- Mounts authorize & callback route
- Adds sign in button on login page

## Installation

Payload v2

```
npm install payload-plugin-oauth@^2
# or
yarn add payload-plugin-oauth@^2
```

Payload v1

```
npm install payload-plugin-oauth@^1
# or
yarn add payload-plugin-oauth@^1
```

## Usage

```js
// payload.config.ts
import path from 'path'

import { webpackBundler } from '@payloadcms/bundler-webpack'
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { slateEditor } from '@payloadcms/richtext-slate'
import axios from 'axios'
import { oAuthPlugin } from 'payload-plugin-oauth'
import { buildConfig } from 'payload/config'
import Users from './collections/Users'

export default buildConfig({
  admin: {
    user: Users.slug,
    bundler: webpackBundler(),
  },
  editor: slateEditor({}),
  collections: [Users],
  typescript: {
    outputFile: path.resolve(__dirname, 'payload-types.ts'),
  },
  graphQL: {
    schemaOutputFile: path.resolve(__dirname, 'generated-schema.graphql'),
  },
  plugins: [
    payloadCloud(),
    oAuthPlugin({
      buttonLabel: 'Sign in with oAuth',
      databaseUri: process.env.DATABASE_URI,
      clientID: process.env.OAUTH_CLIENT_ID,
      clientSecret: process.env.OAUTH_CLIENT_SECRET,
      authorizationURL: process.env.OAUTH_AUTH_ENDPOINT,
      tokenURL: process.env.OAUTH_TOKEN_ENDPOINT,
      authorizePath: '/oauth/authorize1',
      callbackURL: process.env.ORIGIN + '/oauth/callback1',
      async userinfo(accessToken) {
        const { data: user } = await axios.get(
          process.env.OAUTH_USERINFO_ENDPOINT,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        return {
          sub: user.ID,
          username: user.preferred_username,
        }
      },
    }),
    // Another oAuth provider
    oAuthPlugin({
      buttonLabel: 'Sign in with Alternative',
      // These paths must be unique per provider
      authorizePath: '/oauth/authorize2',
      callbackURL: process.env.ORIGIN + '/oauth/callback2',

      ...rest,
    }),
  ],
  db: mongooseAdapter({
    url: process.env.DATABASE_URI,
  }),
})
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information what has changed recently.

## Contributing

Contributions and feedback are very welcome.

To get it running:

1. Clone the project.
2. `npm install`
3. `npm run build`

## Publishing process

1. Run `npm run fix`
2. Run `npm version minor`
3. Push to Github and let CI publish to NPM

## Credits

- [Thomas Ghysels](https://github.com/thgh)
- [Wilson Le](https://github.com/wilsonle)
- [All Contributors][link-contributors]

## License

The MIT License (MIT). Please see [License File](LICENSE) for more information.

[link-contributors]: ../../contributors
