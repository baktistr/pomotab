import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Form controls opt out of the global `:focus-visible` outline. A 2px accent
 * outline with an offset is fine on a small button, but on a full-width field
 * it reads as a validation error — so focus here is a tinted border plus a soft
 * halo instead.
 */
const FIELD_FOCUS =
  'focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30'

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
        'transition-[color,border-color,box-shadow]',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        FIELD_FOCUS,
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs',
        'transition-[color,border-color,box-shadow]',
        'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        FIELD_FOCUS,
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
