// src/lib/schemas.ts
import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  role: z.enum(['CLIENT', 'FREELANCER']),
})

export const amountSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a positive amount'),
})

export const createEscrowSchema = z.object({
  freelancerId: z.string().uuid('Enter a valid freelancer ID'),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount'),
  description: z.string().min(5, 'At least 5 characters'),
  milestoneTitle: z.string().optional(),
})

export const openDisputeSchema = z.object({
  escrowId: z.string().uuid('Enter a valid escrow ID'),
  reason: z.enum(['WORK_NOT_DELIVERED', 'QUALITY_NOT_AS_AGREED', 'PAYMENT_ISSUE', 'FRAUD', 'OTHER']),
  description: z.string().min(20, 'Provide at least 20 characters of context'),
})

export const registerWebhookSchema = z.object({
  url: z.string().url('Enter a valid HTTPS URL'),
  description: z.string().optional(),
  events: z.array(z.string()).min(1, 'Select at least one event'),
})
