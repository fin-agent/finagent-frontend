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

## Deployment

### Production
- **URL**: `https://finagent-deployed.vercel.app`
- ElevenLabs webhook tools point to production Vercel URLs
- Vercel auto-deploys on push to main branch

### Local Development Workflow
ElevenLabs webhooks are configured with production URLs. For local API testing:

```bash
# Test endpoints directly with curl
curl -X POST http://localhost:3000/api/elevenlabs/detailed-trades \
  -H "Content-Type: application/json" \
  -d '{"symbol": "TSLA"}'
```

The full voice agent flow uses production webhooks. Test API logic locally with curl/Postman before deploying.

## Architecture

### Core Data Flow

1. **User** interacts via voice/text with **UnifiedAssistant** component
2. **ElevenLabs Agent** (WebSocket) receives voice input, processes intent
3. Agent calls **Next.js API webhooks** with extracted parameters
4. Webhooks query **Supabase PostgreSQL** for trade data
5. Response flows back to agent for voice synthesis
6. **Generative UI** components render data cards based on message content

### Key Directories

- `app/api/elevenlabs/` - Webhook endpoints called by ElevenLabs agent (tools, profitable-trades, trade-summary, detailed-trades, advanced-query, options, account-balance, fees)
- `app/api/` - UI data endpoints (profitable-trades-ui, trade-stats, trades-ui, advanced-query-ui, account-balance-ui, fees-ui, conversations, messages)
- `src/components/generative-ui/` - Dynamic UI cards (ProfitableTrades, TradeStats, TradesTable, TradeSummary, AdvancedOptionsTable, TradeQueryCard, AccountSummary, FeesSummary, etc.)
- `src/components/UnifiedAssistant.tsx` - Main chat/voice interface
- `src/components/QueryBuilder.tsx` - Manual advanced query builder UI

### Database Tables

- **TradeData** - Trade records with TradeType (B=Buy, S=Sell), SecurityType (S=Stock, O=Option), Symbol, prices, quantities
- **AccountBalance** - Daily account balances and equity
- **AccountInfo** - Account metadata
- **FeesAndInterest** - Transaction fees and interest charges
- **conversations/messages** - Chat history persistence

### Data Explorer (`/data`)

The Data Explorer page provides a retro-futuristic database browser:
- Browse all database tables with pagination
- Search/filter data within tables
- Export to CSV
- Date offset toggle (converts demo dates to display relative to today)

**API Route**: `app/api/data-explorer/route.ts`
**Component**: `src/components/DataExplorer.tsx`

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

### LLM-Based Intent Detection (`src/lib/intent-detection/`)

User queries are classified using Azure OpenAI GPT-5.2 for accurate intent detection and entity extraction. This replaced the brittle regex-based detection system.

**Architecture:**
```
User Query → /api/classify-intent → Azure OpenAI GPT-5.2 → { intent, confidence, entities }
                                                               ↓
                                                     fetchTradeData() → UI Card
```

**Azure OpenAI Configuration:**
- Uses direct `fetch()` to Azure OpenAI REST API (not OpenAI SDK) for precise URL control
- Endpoint format: `https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21`
- Prioritizes `AZURE_EXISTING_AIPROJECT_ENDPOINT` over `AZURE_OPENAI_ENDPOINT` (the former uses the standard openai.azure.com format)
- API key passed via `api-key` header
- **Environment Priority**: Classifier reads `.env.local` directly to bypass conflicting shell environment variables (important when shell has different Azure credentials)

**Key Files:**
- `src/lib/intent-detection/classifier.ts` - Azure OpenAI API call with structured JSON output
- `src/lib/intent-detection/prompt.ts` - Developer prompt with intent definitions
- `src/lib/intent-detection/intents/registry.ts` - All 14 intent definitions
- `src/lib/intent-detection/types.ts` - TypeScript interfaces
- `app/api/classify-intent/route.ts` - Next.js API endpoint

**Intent Domains:**
| Domain | Intents |
|--------|---------|
| `trades` | `trades.profitable`, `trades.detailed`, `trades.time_based`, `trades.stats`, `trades.summary`, `trades.average_price` |
| `options` | `options.bulk`, `options.last_trade`, `options.expiring`, `options.highest_strike`, `options.total_premium` |
| `account` | `account.summary` |
| `fees` | `fees.query` |

**Entity Extraction:**
- `symbol` - Stock ticker (converts company names: "Apple" → "AAPL")
- `timePeriod` - "today", "yesterday", "last week", "this month", "last 30 days"
- `tradeType` - "buy" or "sell"
- `callPut` - "call" or "put"
- `expiration` - "tomorrow", "this week", "this month"
- `accountQueryType` - For account balance queries
- `feeType` - For fees/commission queries

**Fallback:** If LLM classification fails, regex-based `detectUserQueryIntent()` is used as fallback.

### Generative UI Detection

UI components are triggered by LLM intent classification (primary) or pattern matching on agent messages (fallback):
- `trades.profitable` → ProfitableTrades card
- `trades.stats` → TradeStats card
- `trades.detailed` → TradesTable card
- `trades.summary` → TradeSummary card
- `options.bulk` → BulkOptionsCard (bulk options)
- `options.last_trade` → LastOptionTradeCard (single trade)
- `options.expiring` → ExpiringOptionsTable
- `options.highest_strike` → HighestStrikeCard
- `options.total_premium` → TotalPremiumCard
- `account.summary` → AccountSummary card
- `fees.query` → FeesSummary card

### Bulk vs Single Trade Detection

The `detectBulkOptionsQuery` function distinguishes between:
- **Bulk queries** ("show all short calls on Tesla last month") → Shows ALL trades in table
- **Single queries** ("show the last call option I bought") → Shows single trade card

Detection priority: Bulk options are checked FIRST before "last option" to prevent "last month" from triggering single-trade card.

### Option Premium Math

Options follow standard math where 1 contract = 100 shares:
- **Total Premium** = `premium_per_share × contracts × 100`
- **Shares Covered** = `contracts × 100`
- **Avg Premium per Share** = `total_premium / contracts / 100`

The `OptionTradePremium` field in the database is per-share price. The agent says "average premium per share" (not "per contract") to be precise.

### ExpiringOptionsTable Features

- **OCC Symbol Parsing**: `parseOptionSymbol()` extracts ticker from OCC symbols (e.g., `AAPL251121P00175000` → `AAPL`)
- **Pagination**: 10 items per page with navigation controls
- **Urgency Indicators**: "Tomorrow" expirations show urgent styling (red pulse)
- **Days Until**: Each row shows countdown to expiration

### Demo Date Utilities (`src/lib/date-utils.ts`)

The database contains demo data with fixed dates. Date utilities convert between real dates and demo dates:

- **DEMO_TODAY**: `'2025-11-20'` - The "today" date in the demo database
- **realDateToDemoDate(date)**: Converts real date to equivalent demo date for DB queries
- **demoDateToRealDate(demoDate)**: Converts demo date to real date for display
- **formatDisplayDate(demoDateStr)**: Returns relative dates ("Today", "Yesterday", "3 days ago") or formatted date
- **formatCalendarDate(demoDateStr)**: Returns "Dec 11, 2025" format
- **formatDateForDB(date)**: Returns "YYYY-MM-DD" format for Supabase queries

**Usage in UI endpoints**: Import from `@/src/lib/date-utils` (note: `@` alias maps to project root, not `src/`)

### Voice/UI Date Synchronization

**Two date handling modes** depending on query type:

#### 1. "This Year" Queries (No Offset)
For queries like "highest price I sold Apple this year", the database already contains 2025 data, so **no date offset is needed**. Both voice and UI use raw database dates:

```typescript
// formatRawDate - shows database dates directly (no offset)
function formatRawDate(dateStr: string): string {
  if (!dateStr) return '';
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
```

**Files using raw dates for "this year":**
- `app/api/elevenlabs/trade-stats/route.ts` - Voice endpoint
- `app/api/trade-stats/route.ts` - UI endpoint (stock stats)
- `app/api/option-stats/route.ts` - UI endpoint (option stats)

#### 2. Relative Time Queries (With Offset)
For queries like "last month", "yesterday", "last week", date offset IS applied to map real dates to demo database dates:

```typescript
// formatCalendarDate - applies offset for relative time queries
function formatCalendarDate(demoDateStr: string): string {
  const realDate = demoDateToRealDate(demoDateStr);
  return realDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}
```

#### Decision Logic in Endpoints
```typescript
// If timePeriod exists ("last month"), use offset-adjusted dates
// If no timePeriod (full year query), use raw dates
const formatDate = timePeriodDescription ? formatCalendarDate : formatRawDate;
```

### Stats Queries: Dual Card Display

For `trades.stats` queries, the UI fetches BOTH stock stats and option stats in parallel:

```typescript
// UnifiedAssistant.tsx - parallel fetch for stats queries
const [stockRes, optionRes] = await Promise.all([
  fetch('/api/trade-stats', { ... }),   // PRICE STATS card
  fetch('/api/option-stats', { ... }),  // OPTION STATS card
]);
```

This displays two cards side-by-side: stock price statistics (PRICE STATS) and option premium statistics (OPTION STATS).

### Account Balance & Fees Queries

**Account Query Types** (`detectAccountBalanceQuery`):
- `cash_balance` - Cash available in account
- `buying_power` - Day trading buying power
- `account_summary` - Full account overview (default)
- `nlv` - Net liquidation value
- `overnight_margin` - Overnight margin requirement
- `market_value` - Total market value of positions
- `debit_balances` / `credit_balances` - Account balances

**Fee Types** (`detectFeesQuery`):
- `commission` - Trading commissions (from TradeData table)
- `credit_interest` - Interest earned on credit balance
- `debit_interest` - Interest charged on margin
- `locate_fee` - Short locate fees

Both support time period parameters: "today", "this week", "last month", "this year", specific months, etc.

### UI Component Styling

All generative UI components use **inline React styles** (not Tailwind classes) for reliable rendering. This avoids Tailwind JIT compilation issues where classes stored in JavaScript variables aren't scanned.

**Terminal Luxe Design System** (BulkOptionsCard, TotalPremiumCard):
- Dark void backgrounds (`#000000` to `#0f0f0f` gradients)
- Accent colors: profit green (`#00ff88`), loss red (`#ff4466`), call blue (`#00d4ff`), put pink (`#ff66b2`)
- Subtle glow effects on important metrics
- Consistent border styling (`#1a1a1a`)

**AccountSummary Tabular Layout:**
- Uses `DataRow` component for label/value pairs with proper alignment
- Uses `SectionHeader` component to group related metrics
- Alternating row backgrounds for readability
- Color-coded values (green for positive, red for negative, gold for equity)

**FeesSummary Design:**
- Fee type icons and accent colors per category
- Hero amount display with gradient text
- Recent activity breakdown section

### Option Premium Calculations

Advanced query UI uses **net amount** (after fees) for premium totals to match ElevenLabs voice responses:
- `totalPremium` = sum of `NetAmount` fields (includes commission deductions)
- `avgPremium` = average premium per share across trades
- This ensures UI cards show the same values the voice agent speaks

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# ElevenLabs
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=

# Azure OpenAI (for LLM intent classification)
# Use the openai.azure.com endpoint format (not services.ai.azure.com AI Foundry format)
AZURE_EXISTING_AIPROJECT_ENDPOINT=https://<resource>.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_MODEL=gpt-5.2  # Your deployment name
AZURE_OPENAI_API_VERSION=2024-10-21  # Optional, defaults to 2024-10-21
```

**Note:** Shell environment variables override `.env.local`. If you see 401 errors with correct `.env.local` credentials, check for conflicting shell variables with `env | grep AZURE`.

## ElevenLabs Agent Tools

| Tool | Purpose |
|------|---------|
| `get_trade_summary` | Count of stock/option trades for a symbol |
| `get_detailed_trades` | Full trade history with details |
| `get_trade_stats` | Highest/lowest prices, averages |
| `get_profitable_trades` | FIFO-matched profitable trades |
| `get_time_based_trades` | Trades for specific time periods |
| `get_options` | **Dedicated options tool** with 5 query types: `last` (single most recent), `bulk` (multiple trades), `expiring` (by expiration), `highest_strike`, `total_premium` |
| `get_account_balance` | Account balance, equity, buying power, margin info |
| `get_fees` | Commissions, interest charges, and locate fees |
| `advanced_query` | Legacy flexible queries (use `get_options` for options) |

## Testing

Use Playwright MCP to test UI features:
- Navigate pages with `mcp__playwright__browser_navigate`
- Take snapshots with `mcp__playwright__browser_snapshot`
- Click elements with `mcp__playwright__browser_click`
- Type in inputs with `mcp__playwright__browser_type`
- Wait for responses with `mcp__playwright__browser_wait_for`

When testing voice agent features:
1. Navigate to localhost:3000
2. Click "Ask anything" button to open chat
3. Type query in textbox and submit
4. Wait for ElevenLabs agent response
5. Verify UI component renders correctly
6. End call when done testing

**IMPORTANT:** Dev server MUST always run on port 3000. Kill any process using port 3000 before starting (`lsof -ti:3000 | xargs kill -9`). ngrok is configured to forward port 3000 for ElevenLabs webhooks - webhooks will fail if using a different port.
