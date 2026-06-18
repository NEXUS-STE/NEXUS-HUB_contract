'use client'

import { useState } from 'react'
import { useWebhooks, useRegisterWebhook, useDeleteWebhook, useRotateWebhookSecret, useWebhookDeliveries } from '@/hooks/use-nexus-queries'
import { fromNow } from '@/lib/utils'
import { Card, CardHeader, CardTitle, Button, Input, DeliveryStatusBadge, Table, Th, Td, EmptyState } from '@/components/ui'
import { Webhook, Plus, X, Trash2, RefreshCw, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { WebhookEvent } from '@/types'

const ALL_EVENTS: WebhookEvent[] = [
  'TOPUP_COMPLETED','TOPUP_FAILED','PAYMENT_COMPLETED',
  'ESCROW_FUNDED','ESCROW_RELEASED','ESCROW_REFUNDED',
  'WITHDRAWAL_COMPLETED','WITHDRAWAL_FAILED',
  'DISPUTE_OPENED','DISPUTE_RESOLVED',
]

const schema = z.object({
  url: z.string().url('Enter a valid HTTPS URL'),
  description: z.string().optional(),
  events: z.array(z.string()).min(1, 'Select at least one event'),
})

type FormData = z.infer<typeof schema>

function DeliveriesPanel({ endpointId }: { endpointId: string }) {
  const { data } = useWebhookDeliveries(endpointId)
  if (!data?.data.length) return <p className="text-xs text-[#475569] px-4 py-3">No deliveries yet.</p>
  return (
    <Table>
      <thead><tr><Th>Event</Th><Th>Status</Th><Th>Attempts</Th><Th>Response</Th><Th>When</Th></tr></thead>
      <tbody>
        {data.data.map(d => (
          <tr key={d.id}>
            <Td><span className="font-mono text-xs">{d.event}</span></Td>
            <Td><DeliveryStatusBadge status={d.status} /></Td>
            <Td className="text-xs">{d.attempts}</Td>
            <Td className="text-xs text-[#475569]">{d.responseCode ?? '—'}</Td>
            <Td className="text-xs text-[#475569]">{fromNow(d.createdAt)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  )
}

export default function WebhooksPage() {
  const [showForm, setShowForm] = useState(false)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: endpoints } = useWebhooks()
  const register_ = useRegisterWebhook()
  const delete_ = useDeleteWebhook()
  const rotate = useRotateWebhookSecret()

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { events: [] },
  })

  const selectedEvents = watch('events') as string[]

  function toggleEvent(event: string) {
    const current = selectedEvents ?? []
    setValue('events', current.includes(event)
      ? current.filter(e => e !== event)
      : [...current, event]
    )
  }

  async function onSubmit(data: FormData) {
    const result = await register_.mutateAsync({ ...data, events: data.events as WebhookEvent[] })
    if (result?.secret) {
      setNewSecret(result.secret)
      setShowSecret(true)
    }
    reset()
    setShowForm(false)
  }

  async function handleRotate(id: string) {
    const result = await rotate.mutateAsync(id)
    if (result?.secret) {
      setNewSecret(result.secret)
      setShowSecret(true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#F0F6FF]">Webhooks</h1>
          <p className="text-sm text-[#475569] mt-0.5">All events are signed with HMAC-SHA256.</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus size={14} />
          Register endpoint
        </Button>
      </div>

      {/* New secret reveal */}
      {newSecret && (
        <div className="rounded-xl border border-[#F59E0B] bg-[#F59E0B11] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-[#F59E0B]">⚠️ Save your signing secret now — it won't be shown again.</p>
            <button onClick={() => setNewSecret(null)} className="text-[#475569] hover:text-[#F0F6FF]"><X size={14} /></button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[#0A0F1E] rounded-lg px-3 py-2 text-xs font-mono text-[#00D4FF] border border-[#1E2D45] break-all">
              {showSecret ? newSecret : '••••••••••••••••••••••••••••••••'}
            </code>
            <Button variant="ghost" size="sm" onClick={() => setShowSecret(!showSecret)}>
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(newSecret); }}>
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* Register form */}
      {showForm && (
        <Card className="border-[#00D4FF33]">
          <CardHeader>
            <CardTitle>Register Endpoint</CardTitle>
            <button onClick={() => { setShowForm(false); reset() }}><X size={16} className="text-[#475569]" /></button>
          </CardHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Endpoint URL"
              type="url"
              placeholder="https://your-app.com/webhooks/nexushub"
              error={errors.url?.message}
              {...register('url')}
            />
            <Input
              label="Description (optional)"
              placeholder="e.g. Production escrow listener"
              {...register('description')}
            />
            <div>
              <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-2">Events to subscribe</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_EVENTS.map(event => (
                  <label key={event} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-all ${
                    selectedEvents?.includes(event)
                      ? 'border-[#00D4FF] bg-[#00D4FF11] text-[#00D4FF]'
                      : 'border-[#1E2D45] text-[#475569] hover:border-[#253550]'
                  }`}>
                    <input type="checkbox" className="sr-only" checked={selectedEvents?.includes(event)} onChange={() => toggleEvent(event)} />
                    <span className="font-mono">{event}</span>
                  </label>
                ))}
              </div>
              {errors.events && <p className="text-xs text-[#EF4444] mt-1">{errors.events.message}</p>}
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={register_.isPending}><Webhook size={14} /> Register</Button>
              <Button type="button" variant="ghost" onClick={() => { setShowForm(false); reset() }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Endpoints list */}
      {!endpoints?.length ? (
        <Card>
          <EmptyState
            icon={<Webhook size={20} />}
            title="No webhook endpoints"
            description="Register an endpoint to receive real-time payment events."
            action={<Button size="sm" onClick={() => setShowForm(true)}><Plus size={12} /> Register endpoint</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => (
            <Card key={ep.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${ep.isActive ? 'bg-[#10B981]' : 'bg-[#475569]'}`} />
                    <code className="text-sm text-[#F0F6FF] font-mono truncate">{ep.url}</code>
                  </div>
                  {ep.description && <p className="text-xs text-[#475569] mb-2">{ep.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {ep.events.map(e => (
                      <span key={e} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#1A2335] text-[#94A3B8] border border-[#1E2D45]">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => handleRotate(ep.id)} title="Rotate secret">
                    <RefreshCw size={13} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpandedId(expandedId === ep.id ? null : ep.id)}
                    title="View deliveries"
                  >
                    {expandedId === ep.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:text-[#EF4444]"
                    onClick={() => delete_.mutate(ep.id)}
                    title="Delete endpoint"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>

              {expandedId === ep.id && (
                <div className="mt-4 pt-4 border-t border-[#1E2D45]">
                  <p className="text-xs font-medium text-[#475569] uppercase tracking-wider mb-2">Recent deliveries</p>
                  <DeliveriesPanel endpointId={ep.id} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
