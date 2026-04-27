import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CardProps, CardHeaderProps } from '@/lib/themes/types'

const CARD_VARIANT_CLASS: Record<NonNullable<CardProps['variant']>, string> = {
  default: '',
  outlined: 'border-2',
  elevated: 'shadow-md',
}

export default function DefaultCard(props: CardProps): JSX.Element {
  const { className, variant = 'default', ...rest } = props

  return <Card className={cn(CARD_VARIANT_CLASS[variant], className)} {...rest} />
}

export function DefaultCardHeader(props: CardHeaderProps): JSX.Element {
  const { className, title, description, actions, children, ...rest } = props

  if (!title && !description && !actions) {
    return (
      <CardHeader className={className} {...rest}>
        {children}
      </CardHeader>
    )
  }

  return (
    <CardHeader className={className} {...rest}>
      <div className='flex items-start justify-between gap-4'>
        <div className='space-y-1'>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      {children}
    </CardHeader>
  )
}

export { CardContent, CardFooter, CardTitle, CardDescription }
