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

```
npm install payload-plugin-oauth
# or
yarn add payload-plugin-oauth
```

## Usage

```js
// payload.config.ts
import { oAuthPlugin } from 'payload-plugin-oauth'

export default buildConfig({
  serverURL: process.env.SERVER_URL,
  collections: [Users],
  plugins: [
    oAuthPlugin({
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      authorizationURL: process.env.OAUTH_SERVER + '/oauth/authorize',
      tokenURL: process.env.OAUTH_SERVER + '/oauth/token',
      callbackURL: process.env.SERVER_URL + '/oauth2/callback',
      scope: 'basic',
      async userinfo(accessToken) {
        const { data: user } = await axios.get(OAUTH_SERVER + '/oauth/me', {
          params: { access_token: accessToken },
        })
        return {
          sub: user.ID,

          // Custom fields to fill in if user is created
          name: user.display_name || user.user_nicename || 'Naamloos',
          email: user.user_email,
          role: user.capabilities?.administrator ? 'admin' : 'user',
        }
      },
    }),
  ],
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

## Credits

- [Thomas Ghysels](https://github.com/thgh)
- [All Contributors][link-contributors]

## License

The MIT License (MIT). Please see [License File](LICENSE) for more information.

[link-contributors]: ../../contributors
