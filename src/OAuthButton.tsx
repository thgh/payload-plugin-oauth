import Button from 'payload/dist/admin/components/elements/Button'
import React, { useEffect } from 'react'

export default function OAuthButton() {
  useEffect(() => {
    setTimeout(() => {
      // window.location.href = '/a'
    }, 2000)
  }, [])
  return (
    <div style={{ marginBottom: 40 }}>
      <Button el="anchor" url="/oauth2/authorize">
        Sign in with oAuth
      </Button>
    </div>
  )
}
