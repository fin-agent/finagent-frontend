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

- `app/api/elevenlabs/` - Webhook endpoints called by ElevenLabs agent (tools, profitable-trades, trade-summary, detailed-trades, advanced-query, account-balance, fees)
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
User Query → /api/classify-intent → GPT-5.2 → { intent, confidence, entities }
                                                    ↓
                                          fetchTradeData() → UI Card
```

**Key Files:**
- `src/lib/intent-detection/classifier.ts` - GPT API call with structured JSON output
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

Both `AccountSummary` and `FeesSummary` components use **inline React styles** (not Tailwind classes) for reliable rendering. This avoids Tailwind JIT compilation issues where classes stored in JavaScript variables aren't scanned.

**AccountSummary Tabular Layout:**
- Uses `DataRow` component for label/value pairs with proper alignment
- Uses `SectionHeader` component to group related metrics
- Alternating row backgrounds for readability
- Color-coded values (green for positive, red for negative, gold for equity)

**FeesSummary Design:**
- Fee type icons and accent colors per category
- Hero amount display with gradient text
- Recent activity breakdown section

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
| `advanced_query` | Flexible option queries (short/long calls/puts, by date/expiration/strike) |
| `get_account_balance` | Account balance, equity, buying power, margin info |
| `get_fees` | Commissions, interest charges, and locate fees |

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
