'use client'
// src/components/ui/index.tsx
// All primitive UI components for NEXUS-HUB

import { cn, escrowStatusConfig, disputeStatusConfig, txStatusConfig, deliveryStatusConfig } from '@/lib/utils'
import type { EscrowStatus, DisputeStatus, TransactionStatus, WebhookDeliveryStatus } from '@/types'
import { Loader2 } from 'lucide-react'
import { forwardRef } from 'react'

// ─── Button ───────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    const variants = {
      primary:   'bg-[#00D4FF] text-[#0A0F1E] hover:bg-[#00BFEA] font-semibold',
      secondary: 'bg-[#1A2335] text-[#F0F6FF] hover:bg-[#253550] border border-[#1E2D45]',
      ghost:     'text-[#94A3B8] hover:text-[#F0F6FF] hover:bg-[#1A2335]',
      danger:    'bg-[#EF4444] text-white hover:bg-[#DC2626] font-semibold',
      outline:   'border border-[#00D4FF] text-[#00D4FF] hover:bg-[#00D4FF11]',
    }
    const sizes = {
      sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
      md: 'px-4 py-2 text-sm rounded-lg gap-2',
      lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
    }
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center transition-all duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant], sizes[size], className
        )}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" size={size === 'sm' ? 12 : 14} />}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ─── Input ────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'w-full px-3 py-2.5 rounded-lg text-sm',
            'bg-[#0A0F1E] border text-[#F0F6FF] placeholder-[#475569]',
            'focus:outline-none focus:ring-1 transition-colors duration-150',
            error
              ? 'border-[#EF4444] focus:ring-[#EF4444]'
              : 'border-[#1E2D45] focus:border-[#00D4FF] focus:ring-[#00D4FF]',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        {hint && !error && <p className="text-xs text-[#475569]">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ─── Textarea ─────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">{label}</label>}
      <textarea
        ref={ref}
        rows={4}
        className={cn(
          'w-full px-3 py-2.5 rounded-lg text-sm resize-none',
          'bg-[#0A0F1E] border text-[#F0F6FF] placeholder-[#475569]',
          'focus:outline-none focus:ring-1 transition-colors',
          error ? 'border-[#EF4444] focus:ring-[#EF4444]' : 'border-[#1E2D45] focus:border-[#00D4FF] focus:ring-[#00D4FF]',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-[#EF4444]">{error}</p>}
    </div>
  )
)
Textarea.displayName = 'Textarea'

// ─── Card ─────────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[#1E2D45] bg-[#111827] p-5', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-4 flex items-center justify-between', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold text-[#F0F6FF] uppercase tracking-wider', className)}>{children}</h3>
}

// ─── Status Badges ────────────────────────────────────────────
export function EscrowStatusBadge({ status }: { status: EscrowStatus }) {
  const { label, className } = escrowStatusConfig[status] ?? { label: status, className: 'badge-pending' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}>{label}</span>
}

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const { label, className } = disputeStatusConfig[status] ?? { label: status, className: 'badge-pending' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}>{label}</span>
}

export function TxStatusBadge({ status }: { status: TransactionStatus }) {
  const { label, className } = txStatusConfig[status] ?? { label: status, className: 'badge-pending' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}>{label}</span>
}

export function DeliveryStatusBadge({ status }: { status: WebhookDeliveryStatus }) {
  const { label, className } = deliveryStatusConfig[status] ?? { label: status, className: 'badge-pending' }
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', className)}>{label}</span>
}

// ─── Skeleton ─────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[#1A2335]', className)} />
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-3 w-24" />
    </Card>
  )
}

// ─── Empty State ──────────────────────────────────────────────
export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="p-4 rounded-full bg-[#1A2335] text-[#475569]">{icon}</div>
      <div>
        <p className="text-sm font-medium text-[#94A3B8]">{title}</p>
        <p className="text-xs text-[#475569] mt-1 max-w-xs">{description}</p>
      </div>
      {action}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-3 text-left text-xs font-medium text-[#475569] uppercase tracking-wider border-b border-[#1E2D45]', className)}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-3.5 text-sm text-[#94A3B8] border-b border-[#1A2335]', className)}>
      {children}
    </td>
  )
}
