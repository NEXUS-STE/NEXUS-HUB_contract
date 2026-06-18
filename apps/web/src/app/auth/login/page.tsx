'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useLogin } from '@/hooks/use-nexus-queries'
import { Button, Input } from '@/components/ui'
import { Hexagon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuthStore } from '@/stores/auth.store'

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuthStore()
  const login = useLogin()

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    await login.mutateAsync(data)
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-[#0A0F1E] flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] pointer-events-none" />

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="p-2 rounded-xl bg-[#00D4FF11] border border-[#00D4FF33]">
            <Hexagon size={20} className="text-[#00D4FF]" strokeWidth={1.5} />
          </div>
          <span className="font-semibold text-base text-[#F0F6FF]">
            NEXUS<span className="text-[#00D4FF]">-HUB</span>
          </span>
        </div>

        <div className="rounded-2xl border border-[#1E2D45] bg-[#111827] p-8">
          <h1 className="text-lg font-semibold text-[#F0F6FF] mb-1">Sign in</h1>
          <p className="text-sm text-[#475569] mb-6">
            Access your payments dashboard.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              {...register('email')}
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Button
              type="submit"
              className="w-full mt-2"
              size="lg"
              loading={login.isPending}
            >
              Sign in
            </Button>
          </form>
        </div>

        <p className="text-center text-sm text-[#475569] mt-6">
          No account?{' '}
          <Link href="/auth/register" className="text-[#00D4FF] hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  )
}
