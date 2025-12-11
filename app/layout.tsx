import type { Metadata, Viewport } from 'next'
import '../src/index.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#00ff88',
}

export const metadata: Metadata = {
  title: 'FinAgent - AI Trading Assistant',
  description: 'AI-powered financial trading assistant with voice interaction and real-time portfolio analysis',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FinAgent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* PWA meta tags for iOS */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="FinAgent" />

        {/* iOS splash screens */}
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />

        {/* Microsoft tiles */}
        <meta name="msapplication-TileColor" content="#0a0a0c" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />

        {/* Theme colors */}
        <meta name="theme-color" content="#00ff88" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#00ff88" media="(prefers-color-scheme: light)" />
      </head>
      <body>{children}</body>
    </html>
  )
}
