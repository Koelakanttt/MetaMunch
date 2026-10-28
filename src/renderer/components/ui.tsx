import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function Card({
  title,
  children,
  className,
}: {
  title?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cx(
        'rounded-xl border border-slate-800 bg-slate-900/70 p-5 shadow-lg shadow-black/20',
        className,
      )}
    >
      {title ? (
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
          {title}
        </h2>
      ) : null}
      <div className="space-y-3 text-sm text-slate-200">{children}</div>
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
        'rounded-md px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
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
        'rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none',
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
  return <p className={cx('text-sm', TONES[tone])}>{children}</p>
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-300">
      {children}
    </span>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>
}
