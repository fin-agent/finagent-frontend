# CLAUDE.md

Guidance for Claude Code when working with this repository.

## Project Overview

FinAgent: AI-powered financial trading assistant with voice/text via ElevenLabs, real-time trade analysis (FIFO P/L), generative UI. Built with Next.js 15, React 19, TypeScript, Supabase PostgreSQL.

## Commands

```bash
npm install    # Install deps
npm run dev    # Dev server (localhost:3000)
npm run build  # Production build
npm run lint   # ESLint
```

**CLAUDE:** Use **Chrome DevTools MCP** (`mcp__chrome-devtools__new_page`) for localhost, NOT Playwright. If "browser already running" error: `pkill -f "chrome-devtools-mcp/chrome-profile"`.

## Deployment

- **Production:** `https://finagent-deployed.vercel.app` (auto-deploys on push to main)
- **Agent ID:** `agent_3101kbjqgdc0fkgvt8f1zw2hbvxv`
- **System Prompt:** `prompts/finagent-neo.md` - Copy to ElevenLabs dashboard when updating

### Voice/UI Testing Requires Deployment

ElevenLabs webhooks call **production URLs**, not localhost. After voice endpoint changes, commit and push to Vercel for testing.

### Cross-Check for Voice Changes

Always sync these three locations:
1. **System Prompt** (`prompts/finagent-neo.md`) - behavior rules
2. **ElevenLabs Tool Schemas** (dashboard) - parameter definitions (body params MUST be TOP-LEVEL)
3. **Webhook Code** (`app/api/elevenlabs/*.ts`) - actual logic

**Checklist:** Update webhook → Update prompt if needed → Check tool schema → Push to Vercel → Remind user to update dashboard

## Architecture

### Data Flow
User → UnifiedAssistant → ElevenLabs Agent (WebSocket) → Next.js webhooks → Supabase → Response → Voice + Generative UI

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `app/api/elevenlabs/` | Voice webhooks (tools, trades, options, fees, market-data, fundamentals) |
| `app/api/` | UI endpoints (*-ui routes) |
| `src/lib/symbol-utils.ts` | Symbol parsing/normalization |
| `src/lib/date-utils.ts` | Demo date conversion |
| `src/lib/date-parser.ts` | Natural language date parsing |
| `src/lib/intent-detection/` | LLM intent classification |
| `src/services/` | Alpaca (market data), Alpha Vantage (fundamentals) |
| `src/components/generative-ui/` | UI cards |
| `src/components/UnifiedAssistant.tsx` | Main chat/voice interface |

### Database Tables
- **TradeData** - Trades (TradeType: B/S, SecurityType: S/O)
- **AccountBalance** - Daily balances
- **FeesAndInterest** - Fees and interest
- **conversations/messages** - Chat history

## Symbol Utilities (`src/lib/symbol-utils.ts`)

| Function | Purpose |
|----------|---------|
| `normalizeSymbol(input)` | Company names/OCC → tickers |
| `parseOptionSymbol(symbol)` | Extract ticker from OCC |
| `resolveSymbol(input)` | Async with LLM fallback |

Voice webhooks return raw tickers; LLM converts to company names when speaking.

## Date Handling

### Demo Dates (`src/lib/date-utils.ts`)
- **DEMO_TODAY:** `'2025-11-20'`
- `realDateToDemoDate(date)` - Real → demo for DB queries
- `demoDateToRealDate(date)` - Demo → real for display

### Date Parsing (`src/lib/date-parser.ts`)
- `parseTimeExpression(expr)` - Natural language → DateRange
- `parseTimePeriodToResolvedDates(period)` - Extended parser with date ranges
- Auto-strips prefixes: "in October" → "october"

**Supported:** today, yesterday, last week, this month, October, June 1st to 7th, August and September

### Voice/UI Date Sync
- **"This year" queries:** Use raw DB dates (no offset)
- **Relative queries:** Apply offset (formatCalendarDate)

## Intent Detection (`src/lib/intent-detection/`)

Azure OpenAI GPT-5.2 classifies queries. Falls back to regex if LLM fails.

**Intents:** trades.profitable, trades.detailed, trades.time_based, trades.stats, trades.summary, options.bulk, options.last_trade, options.expiring, account.summary, fees.query

**Entities:** symbol, timePeriod, tradeType, callPut, feeType, accountQueryType

### LLM Classifier Race Condition Fix
Message handler awaits `pendingLLMClassifierPromiseRef` before checking intent to ensure classifier completes before rendering UI.

## ElevenLabs Tools

| Tool | Purpose |
|------|---------|
| `get_trade_summary` | Trade counts by symbol |
| `get_detailed_trades` | Full trade history |
| `get_trade_stats` | High/low prices, averages |
| `get_profitable_trades` | FIFO-matched profitable trades |
| `get_time_based_trades` | Trades for time periods |
| `get_options` | Options: last, bulk, expiring, highest_strike, total_premium |
| `get_account_balance` | Balance, equity, margin |
| `get_fees` | Commissions, interest, locate fees |
| `get_market_data` | Alpaca: quotes, charts, news |
| `get_fundamentals` | Alpha Vantage: overview, metrics, financials |

### Tool Parameter Rules

**CRITICAL:** Body parameters must be TOP-LEVEL in ElevenLabs schemas, NOT nested.

```
Body Parameters (correct):
├── symbol, time_period, trade_type
├── security_type (enum: "stock", "option")  ← TOP LEVEL
└── date_filter (object with type, startDate, endDate)
```

### Tool Functions Must Pass time_period

Always pass `time_period` and `date_filter` to webhooks:
```typescript
const voicePayload = await postJson('/api/elevenlabs/trade-summary', {
  symbol, time_period: timePeriod, date_filter: dateFilter
});
```

## Voice/UI Synchronization

### Single-Fetch Architecture
Webhooks return both `response` (voice) AND `uiData` (UI) to prevent drift.

### "Wait for LLM" Pattern
When regex can't extract symbol but query likely has one, wait for LLM classification before UI fetch.

### Double Date Offset Fix
When dateFilter has explicit startDate/endDate (from suggestions), use directly without re-applying offset.

## Account & Fees

**Account Types:** cash_balance, buying_power, account_summary, nlv, margin, market_value

**Fee Types:** commission, credit_interest, debit_interest, locate_fee, short_interest

**Note:** Check `short_interest` BEFORE `debit_interest` in regex (contains "interest").

## Data Availability (`src/lib/data-availability.ts`)

When no data found, suggests parseable periods: this week, last month, this year, last six months, etc.

## Follow-Up Queries

Agent MUST call tool again for follow-ups like "What about September?" - never answer from memory. Preserve symbol from previous query.

## UI Styling

Use **inline React styles** (not Tailwind) for generative UI. Terminal Luxe design: dark backgrounds, accent colors (green profit, red loss, blue calls, pink puts).

## Option Math
- Total Premium = premium_per_share × contracts × 100
- OptionTradePremium in DB is per-share

## FIFO Trade Matching
Buy trades sorted chronologically, sells matched to earliest buy. Profit = Sell NetAmount + Buy NetAmount.

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=
AZURE_EXISTING_AIPROJECT_ENDPOINT=https://<resource>.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_MODEL=gpt-5.2
ALPACA_API_KEY=
ALPACA_SECRET_KEY=
ALPHA_VANTAGE_API_KEY=
```

## Troubleshooting

### ElevenLabs Disconnects
Check DevTools for disconnect reason:
- `"quota limit"` → Billing issue, check elevenlabs.io/app/billing
- `"timeout"` → Check keepalive
- `"user"` → Intentional disconnect

### Connection Stability
- Auto-reconnect: 3 attempts with exponential backoff (2s, 4s, 8s)
- Keepalive: `user_activity` every 30s
- Skips reconnect for quota/billing errors

### Debug Logs
- `🔄 [Status Change]` - Connection states
- `🔴 [Disconnect]` - Disconnect reason
- `⏳ [Voice Mode] Awaiting LLM classifier...` - Race condition handling

## Testing

Dev server MUST run on port 3000. Kill existing: `lsof -ti:3000 | xargs kill -9`

**Voice testing:** Open chat → Type query → Wait for response → Verify UI card → End call (avoid running up credits)

## Commit Guidelines

Update CLAUDE.md and README.md with changes. Use conventional commits:
```
feat: New feature
fix: Bug fix
docs: Documentation
```
