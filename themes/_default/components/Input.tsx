'use client'

import { Input } from '@/components/ui/input'
import { InputProps } from '@/lib/themes/types'

export default function DefaultInput(props: InputProps): JSX.Element {
  return <Input {...props} />
}
