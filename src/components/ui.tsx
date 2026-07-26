import { AlertTriangle, Check, ChevronDown, CircleX, Inbox, LoaderCircle, X } from 'lucide-react'
import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { formatCurrency } from '../lib/format'

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({ className, variant = 'primary', loading, icon, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      className={cn('btn', `btn-${variant}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle size={16} className="animate-spin" /> : icon}
      <span>{children}</span>
    </button>
  )
}

export function IconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={cn('icon-btn', className)} {...props}>{children}</button>
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('card', className)}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </div>
  )
}

interface FieldProps {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
}

export function Input({ label, hint, error, required, className, id: providedId, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <label htmlFor={id} className={cn('field', className)}>
      {label && <span className="field-label">{label}{required && <b aria-hidden="true">*</b>}</span>}
      <input id={id} required={required} aria-invalid={Boolean(error)} {...props} />
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Select({ label, hint, error, required, className, id: providedId, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <label htmlFor={id} className={cn('field', className)}>
      {label && <span className="field-label">{label}{required && <b aria-hidden="true">*</b>}</span>}
      <span className="select-wrap">
        <select id={id} required={required} aria-invalid={Boolean(error)} {...props}>{children}</select>
        <ChevronDown size={16} />
      </span>
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Textarea({ label, hint, error, required, className, id: providedId, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  return (
    <label htmlFor={id} className={cn('field', className)}>
      {label && <span className="field-label">{label}{required && <b aria-hidden="true">*</b>}</span>}
      <textarea id={id} required={required} aria-invalid={Boolean(error)} {...props} />
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'yellow' | 'green' | 'red' | 'blue' | 'purple' }) {
  return <span className={cn('badge', `badge-${tone}`)}>{children}</span>
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status.includes('confirm') || status === 'verified' || status === 'completed' || status === 'delivered' || status === 'approved'
    ? 'green'
    : status === 'cancelled' || status === 'rejected' || status === 'refunded'
      ? 'red'
      : status === 'in_progress' || status === 'proof_uploaded'
        ? 'blue'
        : 'yellow'
  const label = status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
  return <Badge tone={tone}>{label}</Badge>
}

export function StatCard({ label, value, icon, trend, tone = 'default' }: { label: string; value: string | number; icon: ReactNode; trend?: string; tone?: 'default' | 'accent' | 'positive' | 'negative' }) {
  return (
    <Card className={cn('stat-card', `stat-${tone}`)}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        {trend && <small>{trend}</small>}
      </div>
    </Card>
  )
}

export function MoneyStat({ label, value, icon, tone, trend }: { label: string; value: number; icon: ReactNode; tone?: 'default' | 'accent' | 'positive' | 'negative'; trend?: string }) {
  return <StatCard label={label} value={formatCurrency(value)} icon={icon} tone={tone} trend={trend} />
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose(): void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.body.classList.add('modal-open')
    window.addEventListener('keydown', handler)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', handler)
    }
  }, [onClose, open])
  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cn('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false, loading = false }: { open: boolean; onClose(): void; onConfirm(): void; title: string; message: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="confirm-message">
        <span className={danger ? 'confirm-icon danger' : 'confirm-icon'}><AlertTriangle size={22} /></span>
        <p>{message}</p>
      </div>
    </Modal>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span>{icon ?? <Inbox size={24} />}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function LoadingScreen({ label = 'Preparing your workspace…' }: { label?: string }) {
  return (
    <div className="loading-screen">
      <BrandMark size="large" />
      <span className="loading-line"><i /></span>
      <p>{label}</p>
    </div>
  )
}

export function BrandMark({ size = 'normal', withName = false }: { size?: 'normal' | 'large'; withName?: boolean }) {
  return (
    <div className={cn('brand-lockup', size === 'large' && 'brand-large')}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="img">
          <path d="M12 29.5 18.8 10h4.4L30 29.5h-5l-1.3-4.2h-5.5l-1.3 4.2H12Zm7.4-8.1h3.1L21 16.6l-1.6 4.8Z" fill="currentColor" />
          <path d="M30.7 9.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" fill="currentColor" opacity=".5" />
          <path d="M9.5 31.5h21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      {withName && <span className="brand-name"><strong>ABHINAND</strong><small>KARAOKES</small></span>}
    </div>
  )
}

export function ToastStack({ toasts, onDismiss }: { toasts: Array<{ id: string; type: 'success' | 'error' | 'info'; title: string; message?: string }>; onDismiss(id: string): void }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={cn('toast', `toast-${toast.type}`)}>
          <span className="toast-icon">{toast.type === 'success' ? <Check size={18} /> : toast.type === 'error' ? <CircleX size={18} /> : <AlertTriangle size={18} />}</span>
          <div><strong>{toast.title}</strong>{toast.message && <p>{toast.message}</p>}</div>
          <IconButton label="Dismiss" onClick={() => onDismiss(toast.id)}><X size={16} /></IconButton>
        </div>
      ))}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}
