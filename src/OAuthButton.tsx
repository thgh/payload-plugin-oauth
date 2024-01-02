import Button from 'payload/dist/admin/components/elements/Button'
import React from 'react'
import { ButtonProps } from './types'

export default function OAuthButton(props: ButtonProps) {
  return (
    <div style={{ marginBottom: 40 }}>
      <Button el="anchor" url={props.authorizePath}>
        {props.buttonLabel}
      </Button>
    </div>
  )
}
