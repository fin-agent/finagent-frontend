# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FinAgent is an AI-powered financial trading assistant that combines voice/text interaction via ElevenLabs Conversational AI, real-time trade analysis with FIFO profit/loss calculations, and generative UI components. Built with Next.js 15, React 19, TypeScript, and Supabase PostgreSQL.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start development server (localhost:3000)
npm run build        # Build for production
npm run lint         # Run ESLint
```

For webhook testing with ElevenLabs, use ngrok: `ngrok http 3000`

## Architecture

### Core Data Flow

1. **User** interacts via voice/text with **UnifiedAssistant** component
2. **ElevenLabs Agent** (WebSocket) receives voice input, processes intent
3. Agent calls **Next.js API webhooks** with extracted parameters
4. Webhooks query **Supabase PostgreSQL** for trade data
5. Response flows back to agent for voice synthesis
6. **Generative UI** components render data cards based on message content

### Key Directories

- `app/api/elevenlabs/` - Webhook endpoints called by ElevenLabs agent (tools, profitable-trades, trade-summary, detailed-trades)
- `app/api/` - UI data endpoints (profitable-trades-ui, trade-stats, trades-ui, conversations, messages)
- `src/components/generative-ui/` - Dynamic UI cards (ProfitableTrades, TradeStats, TradesTable, TradeSummary)
- `src/components/UnifiedAssistant.tsx` - Main chat/voice interface

### Database Tables

- **TradeData** - Trade records with TradeType (B=Buy, S=Sell), SecurityType (S=Stock, O=Option), Symbol, prices, quantities
- **AccountBalance** - Daily account balances and equity
- **AccountInfo** - Account metadata
- **conversations/messages** - Chat history persistence

### Symbol Normalization (Dual-Layer)

Company names are converted to ticker symbols at two levels:
1. **Agent-level** (system prompt): Agent converts "Apple" → "AAPL" before calling tools
2. **Webhook-level** (code fallback): `normalizeSymbol()` function handles unconverted names

```typescript
const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'microsoft': 'MSFT', 'tesla': 'TSLA',
  'nvidia': 'NVDA', 'meta': 'META', 'netflix': 'NFLX', ...
};
```

### FIFO Trade Matching

Profitable trades calculation uses First-In-First-Out methodology:
- Buy trades sorted chronologically
- Sell trades matched to earliest available buy
- Profit = Sell NetAmount + Buy NetAmount (buy is negative)
- Matching done separately for Stock (S) and Option (O) security types

### Generative UI Detection

UI components are triggered by pattern matching on agent messages:
- "profitable trades" / "profit of $X" → ProfitableTrades card
- "highest price" / "lowest sold" / "average" → TradeStats card
- "found X trades" → TradesTable card
- "X stock trades and Y option trades" → TradeSummary card

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=
```

## ElevenLabs Agent Tools

| Tool | Purpose |
|------|---------|
| `get_trade_summary` | Count of stock/option trades for a symbol |
| `get_detailed_trades` | Full trade history with details |
| `get_trade_stats` | Highest/lowest prices, averages |
| `get_profitable_trades` | FIFO-matched profitable trades |
| `get_time_based_trades` | Trades for specific time periods |

## Testing

Use Chrome DevTools MCP to test UI features:
- Navigate pages with `mcp__chrome-devtools__navigate_page`
- Take snapshots with `mcp__chrome-devtools__take_snapshot`
- Click elements with `mcp__chrome-devtools__click`
- Fill forms with `mcp__chrome-devtools__fill`
- Check console for errors with `mcp__chrome-devtools__list_console_messages`

**IMPORTANT:** Dev server MUST always run on port 3000. Kill any process using port 3000 before starting (`lsof -ti:3000 | xargs kill -9`). ngrok is configured to forward port 3000 for ElevenLabs webhooks - webhooks will fail if using a different port.
