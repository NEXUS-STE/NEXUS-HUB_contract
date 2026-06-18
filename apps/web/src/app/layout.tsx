import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/layout/providers'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: { default: 'NEXUS-HUB', template: '%s | NEXUS-HUB' },
  description: 'Trustless payments orchestration for marketplaces',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1A2335',
                color: '#F0F6FF',
                border: '1px solid #1E2D45',
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#10B981', secondary: '#1A2335' } },
              error:   { iconTheme: { primary: '#EF4444', secondary: '#1A2335' } },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
