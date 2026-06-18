'use client'

import { useState } from 'react'
import { useEscrows, useCreateEscrow } from '@/hooks/use-nexus-queries'
import { formatAmount, formatDate, truncateHash } from '@/lib/utils'
import { Card, CardHeader, CardTitle, Button, Input, Textarea, EscrowStatusBadge, Table, Th, Td, EmptyState, Skeleton } from '@/components/ui'
import { Lock, Plus, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  freelancerId: z.string().uuid('Enter a valid freelancer ID'),
  amount: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  milestoneTitle: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function EscrowPage() {
  const [showForm, setShowForm] = useState(false)
  const { data: escrows, isLoading } = useEscrows({ limit: 20 })
  const createEscrow = useCreateEscrow()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    await createEscrow.mutateAsync(data)
    reset()
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#F0F6FF]">Escrow</h1>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus size={14} />
          New Escrow
        </Button>
      </div>

      {/* Create Escrow Modal-like panel */}
      {showForm && (
        <Card className="border-[#00D4FF33]">
          <CardHeader>
            <CardTitle>Create Escrow</CardTitle>
            <button onClick={() => setShowForm(false)} className="text-[#475569] hover:text-[#F0F6FF]">
              <X size={16} />
            </button>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Freelancer ID"
              placeholder="UUID of the freelancer"
              error={errors.freelancerId?.message}
              hint="Ask the freelancer for their NEXUS-HUB user ID."
              {...register('freelancerId')}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Amount (USD)"
                type="number"
                step="0.01"
                placeholder="0.00"
                error={errors.amount?.message}
                {...register('amount')}
              />
              <Input
                label="Milestone (optional)"
                placeholder="e.g. Phase 1 delivery"
                error={errors.milestoneTitle?.message}
                {...register('milestoneTitle')}
              />
            </div>
            <Textarea
              label="Description"
              placeholder="Describe the work to be done…"
              error={errors.description?.message}
              {...register('description')}
            />
            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={createEscrow.isPending}>
                <Lock size={14} />
                Lock funds in escrow
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); reset() }}>
                Cancel
              </Button>
            </div>
            <p className="text-xs text-[#475569]">
              A 1% platform fee is added to your total. Funds are held on Stellar via Trustless Work.
            </p>
          </form>
        </Card>
      )}

      {/* Escrow list */}
      <Card>
        <CardHeader>
          <CardTitle>All Escrows</CardTitle>
          <span className="text-xs text-[#475569]">{escrows?.total ?? 0} total</span>
        </CardHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !escrows?.data.length ? (
          <EmptyState
            icon={<Lock size={20} />}
            title="No escrows yet"
            description="Create your first escrow to protect a payment."
            action={<Button size="sm" onClick={() => setShowForm(true)}><Plus size={12} /> New Escrow</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Freelancer</Th>
                <Th>Contract</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {escrows.data.map((escrow) => (
                <tr key={escrow.id} className="hover:bg-[#1A2335] transition-colors">
                  <Td>
                    <div>
                      <p className="text-[#F0F6FF] font-medium text-sm">{escrow.description}</p>
                      {escrow.milestoneTitle && (
                        <p className="text-xs text-[#475569] mt-0.5">{escrow.milestoneTitle}</p>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div>
                      <span className="amount font-medium text-[#F0F6FF]">{formatAmount(escrow.amount)}</span>
                      <span className="amount text-xs text-[#475569] block">+{formatAmount(escrow.fee)} fee</span>
                    </div>
                  </Td>
                  <Td><EscrowStatusBadge status={escrow.status} /></Td>
                  <Td className="text-xs">{escrow.freelancer?.firstName ?? '—'}</Td>
                  <Td>
                    {escrow.stellarContractId ? (
                      <span className="hash">{truncateHash(escrow.stellarContractId)}</span>
                    ) : <span className="text-[#475569]">—</span>}
                  </Td>
                  <Td className="text-xs text-[#475569]">{formatDate(escrow.createdAt)}</Td>
                  <Td>
                    <Link href={`/dashboard/escrow/${escrow.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink size={12} />
                      </Button>
                    </Link>
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
