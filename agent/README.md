# FinAgent LiveKit Voice Agent

This is the LiveKit Agents implementation for FinAgent, a voice-enabled trading assistant.

## Setup

### 1. Install Dependencies

```bash
cd agent
npm install
```

### 2. Environment Variables

Create a `.env.local` file in the `agent` directory:

```env
# LiveKit credentials (from LiveKit Cloud)
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud

# Supabase (same as main app)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# OpenAI (for LLM)
OPENAI_API_KEY=your_openai_key

# ElevenLabs (for TTS) - optional, uses LiveKit's model string syntax
ELEVENLABS_API_KEY=your_elevenlabs_key
```

You can also run `lk cloud auth` and `lk app env -w` to automatically populate LiveKit credentials.

### 3. Download Model Files

```bash
npm run download-files
```

### 4. Run in Development

```bash
npm run dev
```

### 5. Run in Production

```bash
npm run build
npm run start
```

## Architecture

### Tools

All trading tools are defined in the `tools/` directory:

- **trades.ts**: Trade summary, detailed trades, trade stats, profitable trades, time-based trades
- **options.ts**: Options queries (bulk, last trade, expiring, highest strike, total premium)
- **account.ts**: Account balance, equity, buying power, margin info
- **fees.ts**: Commissions, interest, locate fees

### Shared Utilities

- **db.ts**: Supabase client configuration
- **symbol-map.ts**: Company name to ticker symbol conversion
- **date-utils.ts**: Date parsing and formatting for demo data

### Main Entry

`index.ts` defines:
- The FinAgent class with all tools and system instructions
- STT/LLM/TTS configuration
- Session management

## Frontend Integration

The frontend needs:

1. **Connection details API** (`/api/livekit/connection-details`): Generates tokens for room access
2. **LiveKitVoiceAssistant component**: React component using `@livekit/components-react`

## Deployment

Deploy to LiveKit Cloud:

```bash
lk agent create
```

This will create the necessary Docker and deployment files.

## Switching TTS Providers

In `index.ts`, change the `tts` field:

```typescript
// ElevenLabs (current)
tts: 'elevenlabs/eleven_turbo_v2_5:JBFqnCBsd6RMkjVDRZzb',

// Cartesia
tts: 'cartesia/sonic-3:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',

// OpenAI
tts: 'openai/tts-1',
```
