import * as React from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'destructive'
  size?: 'default' | 'icon' | 'sm'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50'
    const variants: Record<string, string> = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    }
    const sizes: Record<string, string> = {
      default: 'h-9 px-4 py-2 text-sm',
      sm: 'h-7 px-3 text-xs',
      icon: 'h-7 w-7',
    }
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className ?? ''}`}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
