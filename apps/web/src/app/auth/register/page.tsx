'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRegister } from '@/hooks/use-nexus-queries'
import { Button, Input } from '@/components/ui'
import { Hexagon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['CLIENT', 'FREELANCER']),
})

type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const register_ = useRegister()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'CLIENT' },
  })

  const selectedRole = watch('role')

  async function onSubmit(data: FormData) {
    await register_.mutateAsync(data)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] pointer-events-none" />

      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="p-2 rounded-xl bg-[#00D4FF11] border border-[#00D4FF33]">
            <Hexagon size={20} className="text-[#00D4FF]" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-base text-[#F0F6FF]">
            NEXUS<span className="text-[#00D4FF]">-HUB</span>
          </span>
        </div>

        <div className="rounded-2xl border border-[#1E2D45] bg-[#111827] p-8">
          <h1 className="text-lg font-semibold text-[#F0F6FF] mb-1">Create account</h1>
          <p className="text-sm text-[#475569] mb-6">Join NEXUS-HUB to send and receive payments.</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role toggle */}
            <div>
              <p className="text-xs font-medium text-[#94A3B8] uppercase tracking-wider mb-2">I am a</p>
              <div className="grid grid-cols-2 gap-2">
                {(['CLIENT', 'FREELANCER'] as const).map((role) => (
                  <label
                    key={role}
                    className={`flex items-center justify-center py-2.5 rounded-lg border cursor-pointer text-sm font-medium transition-all ${
                      selectedRole === role
                        ? 'border-[#00D4FF] bg-[#00D4FF11] text-[#00D4FF]'
                        : 'border-[#1E2D45] text-[#475569] hover:border-[#253550]'
                    }`}
                  >
                    <input type="radio" value={role} className="sr-only" {...register('role')} />
                    {role === 'CLIENT' ? 'Client' : 'Freelancer'}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <Input label="Email" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
            <Input label="Password" type="password" placeholder="Min. 8 characters" error={errors.password?.message} {...register('password')} />

            <Button type="submit" className="w-full mt-2" size="lg" loading={register_.isPending}>
              Create account
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#475569] mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-[#00D4FF] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
