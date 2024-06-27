import express from 'express'
import payload from 'payload'

const app = express()

payload.init({
  secret: 'test',
  express: app,
  onInit: async () => {
    await payload.create({
      collection: 'users',
      data: {
        sub: 'existing_sub',
        email: 'test@example.org',
        password: 'password',
        name: 'existing',
      },
    })
    const server = app.listen(0, () =>
      console.log(`http://localhost:${server.address().port}`)
    )
  },
})
