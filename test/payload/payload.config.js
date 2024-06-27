import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { slateEditor } from '@payloadcms/richtext-slate'
import { buildConfig } from 'payload/config'
import { oAuthPlugin } from '../../src/index'

export default buildConfig({
  admin: {
    disable: true,
  },
  editor: slateEditor({}),
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [{ name: 'name', type: 'text', saveToJWT: true }],
    },
  ],
  plugins: [
    oAuthPlugin({
      authorizationURL: process.env.AUTHORIZATION_URL,
      tokenURL: process.env.TOKEN_URL,
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      userinfo: async (accessToken) =>
        fetch(process.env.USERINFO_URL, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }).then((r) => r.json()),
    }),
  ],
  db: mongooseAdapter({ url: '' }),
})
