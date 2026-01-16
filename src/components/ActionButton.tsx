import type { ButtonHTMLAttributes } from 'react'
import type { LinkProps } from 'react-router-dom'
import { Link } from 'react-router-dom'

const buildActionClassName = (className?: string) =>
  ['action-button', className].filter(Boolean).join(' ')

export type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  className?: string
}

export const ActionButton = ({
  className,
  ...props
}: ActionButtonProps) => (
  <button className={buildActionClassName(className)} {...props} />
)

export type ActionButtonLinkProps = LinkProps & {
  className?: string
}

export const ActionButtonLink = ({
  className,
  ...props
}: ActionButtonLinkProps) => (
  <Link className={buildActionClassName(className)} {...props} />
)
