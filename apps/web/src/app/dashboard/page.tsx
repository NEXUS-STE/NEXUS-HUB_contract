'use client'

import { useBalance, useTransactions, useEscrows } from '@/hooks/use-nexus-queries'
import { formatAmount, formatDateTime, fromNow } from '@/lib/utils'
import { Card, CardHeader, CardTitle, TxStatusBadge, EscrowStatusBadge, Skeleton, EmptyState, Table, Th, Td } from '@/components/ui'
import { Wallet, Lock, ArrowUpRight, ArrowDownLeft, TrendingUp, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth.store'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { data: balance, isLoading: balanceLoading } = useBalance()
  const { data: transactions } = useTransactions({ limit: 5 })
  const { data: escrows } = useEscrows({ limit: 5 })

  const activeEscrows = escrows?.data.filter(e => ['PENDING','FUNDED','ACTIVE'].includes(e.status)) ?? []
  const disputed = escrows?.data.filter(e => e.status === 'DISPUTED') ?? []

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-[#F0F6FF]">
          Good to have you back{user?.firstName ? `, ${user.firstName}` : ''}.
        </h1>
        <p className="text-sm text-[#475569] mt-0.5">Here's what's moving in your account.</p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Signature card — the pulse */}
        <div className="balance-pulse rounded-xl border border-[#00D4FF33] bg-gradient-to-br from-[#111827] to-[#0D1E35] p-5 col-span-1">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">Available</span>
            <Wallet size={14} className="text-[#00D4FF]" />
          </div>
          {balanceLoading ? (
            <Skeleton className="h-9 w-40" />
          ) : (
            <p className="amount text-3xl font-semibold text-[#00D4FF]">
              {formatAmount(balance?.availableAmount ?? '0')}
            </p>
          )}
          <p className="text-xs text-[#475569] mt-1">{balance?.currency ?? 'USD'}</p>
        </div>

        <Card>
          <CardHeader>
            <span className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">Reserved in Escrow</span>
            <Lock size={14} className="text-[#F59E0B]" />
          </CardHeader>
          {balanceLoading ? <Skeleton className="h-8 w-32" /> : (
            <p className="amount text-2xl font-semibold text-[#F59E0B]">
              {formatAmount(balance?.reservedAmount ?? '0')}
            </p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <span className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider">Active Escrows</span>
            <TrendingUp size={14} className="text-[#10B981]" />
          </CardHeader>
          <p className="amount text-2xl font-semibold text-[#10B981]">{activeEscrows.length}</p>
          {disputed.length > 0 && (
            <p className="text-xs text-[#F59E0B] mt-1 flex items-center gap-1">
              <AlertTriangle size={10} /> {disputed.length} disputed
            </p>
          )}
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <Link href="/dashboard/wallet" className="text-xs text-[#00D4FF] hover:underline">
            View all →
          </Link>
        </CardHeader>
        {!transactions?.data.length ? (
          <EmptyState
            icon={<ArrowUpRight size={20} />}
            title="No transactions yet"
            description="Top up your wallet to get started."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Description</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.data.map((tx) => (
                <tr key={tx.id} className="hover:bg-[#1A2335] transition-colors">
                  <Td>
                    <div className="flex items-center gap-2">
                      {['TOPUP', 'ESCROW_RELEASE', 'ESCROW_REFUND'].includes(tx.type)
                        ? <ArrowDownLeft size={12} className="text-[#10B981]" />
                        : <ArrowUpRight size={12} className="text-[#EF4444]" />
                      }
                      <span className="font-mono text-xs text-[#F0F6FF]">
                        {tx.type.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="amount font-medium text-[#F0F6FF]">
                      {formatAmount(tx.amount)}
                    </span>
                  </Td>
                  <Td><TxStatusBadge status={tx.status} /></Td>
                  <Td className="max-w-xs truncate">{tx.description ?? '—'}</Td>
                  <Td className="text-[#475569] text-xs">{fromNow(tx.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Recent Escrows */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Escrows</CardTitle>
          <Link href="/dashboard/escrow" className="text-xs text-[#00D4FF] hover:underline">
            View all →
          </Link>
        </CardHeader>
        {!escrows?.data.length ? (
          <EmptyState
            icon={<Lock size={20} />}
            title="No escrows yet"
            description="Create an escrow to start a protected transaction."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th>Counterparty</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {escrows.data.map((escrow) => (
                <tr key={escrow.id} className="hover:bg-[#1A2335] cursor-pointer transition-colors">
                  <Td>
                    <Link href={`/dashboard/escrow/${escrow.id}`} className="text-[#F0F6FF] hover:text-[#00D4FF] transition-colors">
                      {escrow.description}
                    </Link>
                  </Td>
                  <Td><span className="amount font-medium text-[#F0F6FF]">{formatAmount(escrow.amount)}</span></Td>
                  <Td><EscrowStatusBadge status={escrow.status} /></Td>
                  <Td className="text-xs">{escrow.freelancer?.firstName ?? escrow.client?.firstName}</Td>
                  <Td className="text-xs text-[#475569]">{formatDateTime(escrow.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  )
}
