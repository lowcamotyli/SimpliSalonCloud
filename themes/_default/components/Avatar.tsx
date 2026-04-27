'use client'

import { cn } from '@/lib/utils'
import type { AvatarProps } from '@/lib/themes/types'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const AVATAR_SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
}

function getInitials(name?: string) {
  if (!name) {
    return ''
  }

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export default function DefaultAvatar({
  src,
  alt,
  name,
  size = 'md',
  className,
}: AvatarProps & { name?: string; size?: AvatarSize }) {
  const initials = getInitials(name)

  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground',
        AVATAR_SIZE_CLASS[size],
        className
      )}
      aria-label={alt ?? name}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? name ?? ''}
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  )
}
