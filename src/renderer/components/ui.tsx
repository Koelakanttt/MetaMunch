import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Consistent page frame: centred, bounded width, vertical rhythm, own scroll area. */
export function PageLayout({
  children,
  className,
  width = 'default',
}: {
  children: ReactNode
  className?: string
  width?: 'default' | 'wide'
}) {
  return (
    <div
      className={cx(
        'mm-page mx-auto w-full space-y-4 px-4 py-4 lg:px-6',
        width === 'wide' ? 'max-w-[1600px]' : 'max-w-[1180px]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  badges,
  actions,
}: {
  title: string
  subtitle?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-slate-800/80 pb-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-xl font-semibold tracking-tight text-slate-100">
            {title}
          </h1>
          {badges}
        </div>
        {subtitle ? (
          <div className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-400">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cx(
        'relative min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 shadow-lg shadow-black/20',
        className,
      )}
    >
      {title || actions ? (
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-800/70 px-4 py-2.5">
          {title ? (
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              {title}
            </h2>
          ) : null}
          {subtitle ? <div className="text-[11px] text-slate-500">{subtitle}</div> : null}
          {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx('space-y-3 p-4 text-sm text-slate-200', bodyClassName)}>{children}</div>
    </section>
  )
}

const BUTTON_STYLES = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500',
  secondary: 'bg-slate-700 text-slate-100 hover:bg-slate-600',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800',
}

export function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON_STYLES
}) {
  return (
    <button
      type={type}
      className={cx(
        'rounded-md px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_STYLES[variant],
        className,
      )}
      {...props}
    />
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
      {children}
    </span>
  )
}

const TONES = {
  default: 'text-slate-200',
  muted: 'text-slate-400',
  error: 'text-rose-400',
  success: 'text-emerald-400',
}

export function StatusLine({
  children,
  tone = 'default',
}: {
  children: ReactNode
  tone?: keyof typeof TONES
}) {
  return <p className={cx('text-sm leading-relaxed', TONES[tone])}>{children}</p>
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'accent' | 'warning'
}) {
  const tones = {
    slate: 'bg-slate-800 text-slate-300',
    accent: 'bg-indigo-500/15 text-indigo-300 ring-1 ring-inset ring-indigo-500/30',
    warning: 'bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/30',
  }
  return (
    <span
      className={cx(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-4 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}
