'use client'

import { useState } from 'react'
import { useBalance, useTransactions, useTopup, useWithdrawal } from '@/hooks/use-nexus-queries'
import { formatAmount, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardTitle, Button, Input, TxStatusBadge, Table, Th, Td, EmptyState, Skeleton } from '@/components/ui'
import { Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const amountSchema = z.object({
  amount: z.string().min(1).refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount'),
})

export default function WalletPage() {
  const [tab, setTab] = useState<'topup' | 'withdraw'>('topup')
  const { data: balance, isLoading } = useBalance()
  const { data: txs } = useTransactions({ limit: 20 })
  const topup = useTopup()
  const withdraw = useWithdrawal()

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(amountSchema),
  })

  async function onSubmit({ amount }: { amount: string }) {
    if (tab === 'topup') await topup.mutateAsync(amount)
    else await withdraw.mutateAsync(amount)
    reset()
  }

  const isPending = topup.isPending || withdraw.isPending

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-[#F0F6FF]">Wallet</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Signature balance */}
        <div className="balance-pulse md:col-span-1 rounded-xl border border-[#00D4FF33] bg-gradient-to-br from-[#111827] to-[#0D1E35] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">Available Balance</span>
            <Wallet size={14} className="text-[#00D4FF]" />
          </div>
          {isLoading ? <Skeleton className="h-10 w-40" /> : (
            <div>
              <p className="amount text-3xl font-semibold text-[#00D4FF]">
                {formatAmount(balance?.availableAmount ?? '0')}
              </p>
              <p className="text-xs text-[#475569] mt-1">{balance?.currency}</p>
            </div>
          )}
          <div className="mt-4 pt-4 border-t border-[#1E2D45]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#475569]">Reserved in escrow</span>
              <span className="amount text-sm text-[#F59E0B]">{formatAmount(balance?.reservedAmount ?? '0')}</span>
            </div>
          </div>
        </div>

        {/* Top-up / Withdraw form */}
        <Card className="md:col-span-2">
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setTab('topup')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'topup'
                  ? 'bg-[#00D4FF] text-[#0A0F1E]'
                  : 'bg-[#1A2335] text-[#94A3B8] hover:text-[#F0F6FF]'
              }`}
            >
              <ArrowDownLeft size={13} className="inline mr-1.5" />
              Top Up
            </button>
            <button
              onClick={() => setTab('withdraw')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === 'withdraw'
                  ? 'bg-[#00D4FF] text-[#0A0F1E]'
                  : 'bg-[#1A2335] text-[#94A3B8] hover:text-[#F0F6FF]'
              }`}
            >
              <ArrowUpRight size={13} className="inline mr-1.5" />
              Withdraw
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label={tab === 'topup' ? 'Amount to add (USD)' : 'Amount to withdraw (USD)'}
              type="number"
              step="0.01"
              min="1"
              placeholder="0.00"
              error={errors.amount?.message}
              hint={
                tab === 'topup'
                  ? 'Funds will be credited via Airtm.'
                  : `Max available: ${formatAmount(balance?.availableAmount ?? '0')}`
              }
              {...register('amount')}
            />
            <Button type="submit" loading={isPending} className="w-full">
              {tab === 'topup' ? 'Top Up via Airtm' : 'Withdraw to Airtm'}
            </Button>
          </form>

          <p className="text-xs text-[#475569] mt-4 flex items-center gap-1.5">
            <RefreshCw size={10} />
            Processing typically takes 1–3 minutes via Airtm.
          </p>
        </Card>
      </div>

      {/* Transaction history */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        {!txs?.data.length ? (
          <EmptyState
            icon={<ArrowUpRight size={20} />}
            title="No transactions yet"
            description="Your transaction history will appear here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Fee</Th>
                <Th>Status</Th>
                <Th>Description</Th>
                <Th>Reference</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {txs.data.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#1A2335] transition-colors">
                  <Td>
                    <span className="font-mono text-xs text-[#94A3B8]">
                      {tx.type.replace(/_/g, ' ')}
                    </span>
                  </Td>
                  <Td>
                    <span className="amount font-medium text-[#F0F6FF]">{formatAmount(tx.amount)}</span>
                  </Td>
                  <Td>
                    <span className="amount text-xs text-[#475569]">{formatAmount(tx.fee)}</span>
                  </Td>
                  <Td><TxStatusBadge status={tx.status} /></Td>
                  <Td className="max-w-xs truncate text-xs">{tx.description ?? '—'}</Td>
                  <Td>
                    {tx.reference ? (
                      <span className="hash" title={tx.reference}>
                        {tx.reference.slice(0, 12)}…
                      </span>
                    ) : '—'}
                  </Td>
                  <Td className="text-xs text-[#475569]">{formatDateTime(tx.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
