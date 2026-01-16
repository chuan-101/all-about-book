import type { ButtonHTMLAttributes } from 'react'
import type { LinkProps } from 'react-router-dom'
import { Link } from 'react-router-dom'

type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger'

type SharedButtonProps = {
  variant?: ButtonVariant
  className?: string
}

const variantClassMap: Record<ButtonVariant, string> = {
  primary: 'primary',
  ghost: 'ghost',
  outline: 'outline',
  danger: 'danger',
}

const buildClassName = (variant: ButtonVariant, className?: string) =>
  ['button', variantClassMap[variant], className].filter(Boolean).join(' ')

export type ButtonProps = SharedButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement>

export const Button = ({
  variant = 'primary',
  className,
  ...props
}: ButtonProps) => (
  <button className={buildClassName(variant, className)} {...props} />
)

export type ButtonLinkProps = SharedButtonProps & LinkProps

export const ButtonLink = ({
  variant = 'primary',
  className,
  ...props
}: ButtonLinkProps) => (
  <Link className={buildClassName(variant, className)} {...props} />
)
