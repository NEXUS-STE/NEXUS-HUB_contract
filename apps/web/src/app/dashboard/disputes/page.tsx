'use client'

import { useState } from 'react'
import { useDisputes, useOpenDispute } from '@/hooks/use-nexus-queries'
import { formatDate, fromNow } from '@/lib/utils'
import { Card, CardHeader, CardTitle, Button, Input, Textarea, DisputeStatusBadge, Table, Th, Td, EmptyState } from '@/components/ui'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const DISPUTE_REASONS = [
  { value: 'WORK_NOT_DELIVERED', label: 'Work not delivered' },
  { value: 'QUALITY_NOT_AS_AGREED', label: 'Quality not as agreed' },
  { value: 'PAYMENT_ISSUE', label: 'Payment issue' },
  { value: 'FRAUD', label: 'Fraud' },
  { value: 'OTHER', label: 'Other' },
]

const schema = z.object({
  escrowId: z.string().uuid('Enter a valid escrow ID'),
  reason: z.enum(['WORK_NOT_DELIVERED','QUALITY_NOT_AS_AGREED','PAYMENT_ISSUE','FRAUD','OTHER']),
  description: z.string().min(20, 'Provide at least 20 characters of context'),
})

type FormData = z.infer<typeof schema>

export default function DisputesPage() {
  const [showForm, setShowForm] = useState(false)
  const { data: disputes, isLoading } = useDisputes({ limit: 20 })
  const openDispute = useOpenDispute()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { reason: 'WORK_NOT_DELIVERED' },
  })

  async function onSubmit(data: FormData) {
    await openDispute.mutateAsync(data)
    reset()
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F6FF]">Disputes</h1>
          <p className="text-sm text-[#475569] mt-0.5">Our team reviews disputes within 24 hours.</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm" variant="outline">
          <Plus size={14} />
          Open Dispute
        </Button>
      </div>

      {showForm && (
        <Card className="border-[#F59E0B33]">
          <CardHeader>
            <CardTitle>Open a Dispute</CardTitle>
            <button onClick={() => setShowForm(false)} className="text-[#475569] hover:text-[#F0F6FF]">
              <X size={16} />
            </button>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Escrow ID"
              placeholder="UUID of the escrow in question"
              error={errors.escrowId?.message}
              hint="Find this on your Escrow page."
              {...register('escrowId')}
            />
            <div>
              <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-2">Reason</p>
              <div className="grid grid-cols-2 gap-2">
                {DISPUTE_REASONS.map((r) => (
                  <label key={r.value} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[#1E2D45] cursor-pointer hover:border-[#253550] text-sm text-[#94A3B8] has-[:checked]:border-[#F59E0B] has-[:checked]:text-[#F59E0B] has-[:checked]:bg-[#F59E0B11] transition-all">
                    <input type="radio" value={r.value} className="sr-only" {...register('reason')} />
                    {r.label}
                  </label>
                ))}
              </div>
              {errors.reason && <p className="text-xs text-[#EF4444] mt-1">{errors.reason.message}</p>}
            </div>
            <Textarea
              label="Description"
              placeholder="Explain what happened and what outcome you're seeking…"
              error={errors.description?.message}
              {...register('description')}
            />
            <div className="flex gap-3">
              <Button type="submit" variant="outline" loading={openDispute.isPending}>
                <AlertTriangle size={14} />
                Submit dispute
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); reset() }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Disputes</CardTitle>
          <span className="text-xs text-[#475569]">{disputes?.total ?? 0} total</span>
        </CardHeader>

        {!disputes?.data.length ? (
          <EmptyState
            icon={<AlertTriangle size={20} />}
            title="No disputes"
            description="Disputes on your escrows will appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Description</Th>
                <Th>Resolution</Th>
                <Th>Opened</Th>
                <Th>Resolved</Th>
              </tr>
            </thead>
            <tbody>
              {disputes.data.map((d) => (
                <tr key={d.id} className="hover:bg-[#1A2335] transition-colors">
                  <Td>
                    <span className="text-xs font-mono text-[#94A3B8]">
                      {d.reason.replace(/_/g, ' ')}
                    </span>
                  </Td>
                  <Td><DisputeStatusBadge status={d.status} /></Td>
                  <Td className="max-w-xs">
                    <p className="text-xs text-[#94A3B8] line-clamp-2">{d.description}</p>
                  </Td>
                  <Td className="text-xs text-[#475569]">{d.resolution ?? '—'}</Td>
                  <Td className="text-xs text-[#475569]">{fromNow(d.createdAt)}</Td>
                  <Td className="text-xs text-[#475569]">
                    {d.resolvedAt ? formatDate(d.resolvedAt) : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
