'use client';

import { LiveKitVoiceAssistant } from '@/src/components/LiveKitVoiceAssistant';

export default function LiveKitTestPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #111111 100%)',
      padding: '32px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <header style={{
        textAlign: 'center',
        marginBottom: '48px',
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#ffffff',
          marginBottom: '8px',
        }}>
          LiveKit Voice Agent
        </h1>
        <p style={{
          color: '#888888',
          fontSize: '16px',
        }}>
          Test the new LiveKit-powered voice assistant
        </p>
      </header>

      <main style={{
        width: '100%',
        maxWidth: '500px',
      }}>
        <LiveKitVoiceAssistant />
      </main>

      <footer style={{
        marginTop: '48px',
        textAlign: 'center',
      }}>
        <a
          href="/"
          style={{
            color: '#00d4ff',
            textDecoration: 'none',
            fontSize: '14px',
          }}
        >
          Back to main app
        </a>
      </footer>
    </div>
  );
}
