import type { Metadata } from 'next'
import '../src/index.css'

export const metadata: Metadata = {
  title: 'WeTrade - Financial Portfolio',
  description: 'AI-powered financial portfolio management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

