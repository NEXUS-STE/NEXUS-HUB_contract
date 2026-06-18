'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Lock, AlertTriangle, Webhook,
  Wallet, Settings, LogOut, Hexagon,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/services/api'
import { useRouter } from 'next/navigation'

const navItems = [
  { href: '/dashboard',          icon: LayoutDashboard, label: 'Overview' },
  { href: '/dashboard/wallet',   icon: Wallet,          label: 'Wallet' },
  { href: '/dashboard/escrow',   icon: Lock,            label: 'Escrow' },
  { href: '/dashboard/disputes', icon: AlertTriangle,   label: 'Disputes' },
  { href: '/dashboard/webhooks', icon: Webhook,         label: 'Webhooks' },
  { href: '/dashboard/settings', icon: Settings,        label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, refreshToken, clearAuth } = useAuthStore()

  async function handleLogout() {
    if (refreshToken) {
      try { await authApi.logout(refreshToken) } catch {}
    }
    clearAuth()
    router.push('/auth/login')
  }

  return (
    <aside className="flex flex-col w-56 min-h-screen bg-[#0D1424] border-r border-[#1E2D45] py-6">
      {/* Logo */}
      <div className="px-5 mb-8 flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-[#00D4FF11] border border-[#00D4FF33]">
          <Hexagon size={18} className="text-[#00D4FF]" strokeWidth={1.5} />
        </div>
        <span className="font-semibold text-sm tracking-wide text-[#F0F6FF]">
          NEXUS<span className="text-[#00D4FF]">-HUB</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150',
                active
                  ? 'bg-[#1E3A5F] text-[#00D4FF] font-medium'
                  : 'text-[#94A3B8] hover:text-[#F0F6FF] hover:bg-[#1A2335]'
              )}
            >
              <Icon size={16} strokeWidth={active ? 2 : 1.5} />
              {label}
              {active && (
                <span className="ml-auto w-1 h-1 rounded-full bg-[#00D4FF]" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 mt-4 pt-4 border-t border-[#1E2D45]">
        {user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-[#F0F6FF] truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-[#475569] truncate">{user.email}</p>
            <span className="mt-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[#1A2335] text-[#00D4FF] border border-[#1E3A5F] font-mono uppercase">
              {user.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF444411] transition-all duration-150"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
