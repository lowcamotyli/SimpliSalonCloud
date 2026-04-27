'use client'

import { Button, type ButtonProps as ShadcnButtonProps } from '@/components/ui/button'
import { ButtonProps } from '@/lib/themes/types'

export default function DefaultButton(props: ButtonProps): JSX.Element {
  return <Button {...(props as ShadcnButtonProps)} />
}
