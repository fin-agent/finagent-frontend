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

### ElevenLabs Agent Configuration
- **Agent ID**: `agent_3101kbjqgdc0fkgvt8f1zw2hbvxv`
- **System Prompt**: `prompts/finagent-neo.md` - Copy this to ElevenLabs dashboard when updating
- **Dashboard**: Configure agent settings, tools, and system prompt in ElevenLabs Conversational AI dashboard

### Local Development Workflow
ElevenLabs webhooks are configured with production URLs. For local API testing:

```bash
# Test endpoints directly with curl
curl -X POST http://localhost:3000/api/elevenlabs/detailed-trades \
  -H "Content-Type: application/json" \
  -d '{"symbol": "TSLA"}'
```

The full voice agent flow uses production webhooks. Test API logic locally with curl/Postman before deploying.

### Voice/UI Testing Requires Deployment

**IMPORTANT FOR CLAUDE:** When making changes to `app/api/elevenlabs/*` endpoints (voice webhooks), **notify the user that testing the voice agent requires deploying to Vercel first**. The ElevenLabs voice agent calls production URLs, not localhost, so:

1. Local changes to voice endpoints won't affect the voice agent until deployed
2. UI changes may work locally, but voice responses will use production code
3. This can cause voice/UI drift where they show different data

After making voice endpoint changes, remind the user: "This change affects the voice agent. I'll commit and push to Vercel so you can test the voice flow."

## Architecture

### Core Data Flow

1. **User** interacts via voice/text with **UnifiedAssistant** component
2. **ElevenLabs Agent** (WebSocket) receives voice input, processes intent
3. Agent calls **Next.js API webhooks** with extracted parameters
4. Webhooks query **Supabase PostgreSQL** for trade data
5. Response flows back to agent for voice synthesis
6. **Generative UI** components render data cards based on message content

### Key Directories

- `app/api/elevenlabs/` - Webhook endpoints called by ElevenLabs agent (tools, profitable-trades, trade-summary, detailed-trades, advanced-query, options, account-balance, fees, market-data, fundamentals)
- `app/api/` - UI data endpoints (profitable-trades-ui, trade-stats, trades-ui, advanced-query-ui, account-balance-ui, fees-ui, conversations, messages, resolve-symbol)
- `src/lib/symbol-utils.ts` - Centralized symbol parsing and normalization utilities
- `src/services/alpacaMarketData.ts` - Alpaca Markets API client (stock quotes, option NBBO, bars, news)
- `src/services/alphaVantageApi.ts` - Alpha Vantage API client (company overview, financials, earnings, dividends)
- `src/lib/option-symbol-builder.ts` - OCC option symbol parsing utilities
- `src/components/generative-ui/` - Dynamic UI cards (ProfitableTrades, TradeStats, TradesTable, TradeSummary, AdvancedOptionsTable, TradeQueryCard, AccountSummary, FeesSummary, StockQuoteCard, OptionQuoteCard, CompanyOverviewCard, etc.)
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

### Symbol Utilities (`src/lib/symbol-utils.ts`)

Centralized symbol parsing and normalization for all API routes and components.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `normalizeSymbol(input)` | Convert company names or OCC symbols to tickers |
| `parseOptionSymbol(symbol)` | Extract ticker from OCC option symbol |
| `isOptionSymbol(symbol)` | Check if symbol is OCC format |
| `parseOptionSymbolFull(symbol)` | Parse OCC into ticker, expiry, type, strike |
| `resolveSymbol(input)` | Async version with LLM fallback |

### LLM-Based Ticker-to-Company-Name Conversion

**Voice webhooks return raw ticker symbols** (AAPL, TSLA, GOOGL). The ElevenLabs LLM uses its training knowledge to convert these to company names when speaking aloud.

**How it works:**
1. Webhook returns: `"For AAPL, you have 5 profitable trades..."`
2. LLM prompt instructs: "When speaking ticker symbols aloud, say the company name"
3. Voice says: "For Apple, you have 5 profitable trades..."

**Why this approach:**
- No hardcoded map to maintain
- LLM knows thousands of tickers from training data
- Handles edge cases and new companies automatically
- More flexible for unknown tickers (LLM can say "ticker XYZ" if truly unknown)

**Prompt section** (`prompts/finagent-neo.md`):
```markdown
# Speaking Company Names

**When speaking ticker symbols aloud, say the company name instead of the ticker.**

You know all major company ticker mappings from your training data:
- AAPL → "Apple"
- GOOGL/GOOG → "Google"
- TSLA → "Tesla"
- etc.
```

**`normalizeSymbol()` handles multiple input types:**
```typescript
normalizeSymbol("Apple")              // → "AAPL" (company name)
normalizeSymbol("TSLA251129C00350000") // → "TSLA" (OCC option symbol)
normalizeSymbol("TSLA251129")          // → "TSLA" (partial OCC)
normalizeSymbol("AAPL")               // → "AAPL" (passthrough)
```

**Async `resolveSymbol()` with LLM fallback:**
```typescript
// For unknown company names, falls back to Azure OpenAI
const ticker = await resolveSymbol("microstrategy"); // → "MSTR"
const ticker = await resolveSymbol("the streaming company"); // → "NFLX"
```

**Symbol Resolution Flow:**
1. **OCC Parsing**: Extract ticker from option symbols like `TSLA251129C00350000`
2. **Company Map**: Check 50+ predefined company name → ticker mappings
3. **LLM Fallback**: Use `/api/resolve-symbol` endpoint for unknowns

**Company Map includes:**
```typescript
const SYMBOL_MAP = {
  'apple': 'AAPL', 'google': 'GOOGL', 'alphabet': 'GOOGL',
  'amazon': 'AMZN', 'microsoft': 'MSFT', 'tesla': 'TSLA',
  'nvidia': 'NVDA', 'meta': 'META', 'netflix': 'NFLX',
  'bank of america': 'BAC', 'jpmorgan': 'JPM', ...
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

### Natural Language Date Parsing (`src/lib/date-parser.ts`)

Parses natural language time expressions into database-ready date ranges. Handles ElevenLabs prefix variations automatically.

**Key Functions:**

| Function | Purpose |
|----------|---------|
| `parseTimeExpression(expr)` | Parse natural language → DateRange with DB-adjusted dates |
| `parseTimePeriodToResolvedDates(period)` | Extended parser for date ranges and discrete dates |
| `extractTimePeriodFromQuery(query)` | Extract time portion from a full query |
| `resolveDateFilter(filter)` | Resolve LLM DateFilter to DB-ready dates |

**Prefix Stripping:**

ElevenLabs often sends time periods with prepositions like "in October", "for last week", "during September". Both `parseTimeExpression()` and `parseTimePeriodToResolvedDates()` automatically strip these prefixes:

```typescript
// Handles: "in October" → "october"
// Handles: "for last week" → "last week"
// Handles: "during September" → "september"
lowerExpr = lowerExpr.replace(/^(in|for|during)\s+/i, '');
```

**Supported Expressions:**

| Category | Examples |
|----------|----------|
| Relative | `today`, `yesterday`, `last week`, `this month` |
| N-Days | `last 5 days`, `past 10 days` |
| Months | `October`, `September`, `in August` |
| Date Ranges | `June 1st to 7th`, `November 15 to December 5` |
| Multi-Month | `August and September`, `August through October` |
| Discrete Dates | `July 1st and August 1st` |

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
- `locate_fee` - Short locate fees (borrow fees for specific symbols)
- `short_interest` - Short interest charges (borrow fees for shorting stocks, maps to `LocateFee` in DB)

Both support time period parameters: "today", "this week", "last month", "this year", specific months, etc.

**IMPORTANT:** In regex detection, `short_interest` must be checked BEFORE `debit_interest` because "short interest" contains "interest" which would otherwise match `debit_interest`.

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

**FeesSummary Design (Compact):**
- Compact layout optimized to fit in chat panel without scrolling
- Fee type icons (28x28px) and accent colors per category
- Hero amount display (24px) with gradient text
- Stats grid with "Transactions" and "Average" metrics
- Recent activity breakdown (3 items max, 90px height)

### Voice/UI Trades Synchronization

For `trades.detailed` queries (e.g., "Show my trades for Apple"), both voice and UI endpoints return **identical summary metrics**:

| Metric | Description |
|--------|-------------|
| `tradeCount` | Total number of trades (stocks + options) |
| `stockCount` | Number of stock trades |
| `optionCount` | Number of option trades |
| `buyCount` | Number of buy trades |
| `sellCount` | Number of sell trades |
| `totalShares` | Sum of stock share quantities |
| `totalContracts` | Sum of option contracts |
| `totalQuantity` | `totalShares + totalContracts` |
| `totalValue` | Sum of absolute `NetAmount` values |
| `avgValue` | `totalValue / tradeCount` |

**Key files:**
- `app/api/elevenlabs/detailed-trades/route.ts` - Voice endpoint (TTS response)
- `app/api/trades-ui/route.ts` - UI endpoint (JSON for TradesTable card)

Both use absolute values of `NetAmount` for `totalValue` because buy trades have negative amounts (money out) and sell trades have positive amounts (money in).

### Option Premium Calculations

Advanced query UI uses **net amount** (after fees) for premium totals to match ElevenLabs voice responses:
- `totalPremium` = sum of `NetAmount` fields (includes commission deductions)
- `avgPremium` = average premium per share across trades
- This ensures UI cards show the same values the voice agent speaks

### Voice/UI Symbol Synchronization ("Wait for LLM" Pattern)

When regex detection can't extract a symbol from a query, the UI must **wait for LLM classification** before fetching data. This prevents voice/UI drift where the voice says correct data but UI shows wrong data.

**Problem Scenario:**
```
User says: "How much did I pay to borrow MTEN stock this year?"
ElevenLabs transcribes: "M10" (speech recognition error)
Regex extracts: symbol="" (M10 not recognized)
Without fix: UI fetches ALL locate fees ($424) instead of MTEN ($67)
Voice says: "$67 for MTEN" (correct - server LLM inferred MTEN)
UI shows: "$424" (wrong - no symbol filter applied)
```

**Solution: `shouldWaitForLLM` Flag**

In `UnifiedAssistant.tsx`, when intent detection succeeds but symbol extraction fails for queries that likely contain a symbol:

```typescript
// Detect if query likely has symbol but regex couldn't extract it
const shouldWaitForLLM = (intentType && !symbol && queryLikelyHasSymbol(userText));

if (shouldWaitForLLM) {
  console.log('🔄 [Wait-for-LLM] Query has intent but no symbol, waiting for LLM...');
  // Don't prefetch UI data - wait for LLM classification
}
```

**Speech Recognition Corrections:**

ElevenLabs speech-to-text often mishears stock tickers. The LLM prompt includes corrections:

| Transcribed | Corrected |
|-------------|-----------|
| "M10", "M 10", "MTN", "emten" | MTEN |
| "LC ID", "L C I D", "lucid" | LCID |
| "UI path", "you eye path" | PATH |

The LLM naturally corrects these from context (e.g., "locate fees for M10" → symbol: "MTEN").

**Symbol Extraction from Agent Responses:**

For `CardType: 'none'` (entity extraction), the classifier extracts symbols from agent responses:
```
Agent: "The total locate fees you paid for stock MTEN this year is $67.00"
LLM extracts: { symbol: "MTEN" } → Used to re-fetch UI with correct filter
```

**Key Files:**
- `src/components/UnifiedAssistant.tsx` - `shouldWaitForLLM` logic
- `src/lib/intent-detection/prompt.ts` - Speech correction rules
- `src/lib/intent-detection/types.ts` - `CardType: 'none'` for entity extraction

### Voice/UI Single-Fetch Architecture

Voice webhooks return **both** `response` AND `uiData` in a single API call to prevent voice/UI drift:

```typescript
// Voice webhook returns both response and UI data
return NextResponse.json({
  response: "The total debit interest for last six months is $402 across 13 transactions",
  uiData: {
    feeType: 'debit_interest',
    totalAmount: 402,
    transactionCount: 13,
    timePeriod: 'the last six months',
    breakdown: [...],
    suggestion: null  // Only set when no data found
  }
});
```

**Key Principle:** Single source of truth - voice webhook computes data once, both voice and UI use that exact data.

### LLM Classifier Race Condition Fix

When a user sends a message, the LLM classifier runs asynchronously to detect intent. However, the assistant's response message may arrive BEFORE the classifier completes. This caused UI cards to not render because `pendingQueryIntentRef.current` was still null.

**Problem Scenario:**
```
1. User sends "Show my account summary"
2. User message handler starts LLM classifier (async)
3. ElevenLabs agent processes and responds quickly
4. Assistant message arrives → checks pendingQueryIntentRef → null (classifier not done!)
5. UI card doesn't render despite correct voice response
```

**Solution: Await Classifier Promise**

A `pendingLLMClassifierPromiseRef` stores the classifier promise. The message handler awaits it before checking the pending intent:

```typescript
// CRITICAL: Await LLM classifier before checking pendingIntent
// The classifier runs async in user message handler and may not have finished yet
if (!tradeUI && pendingLLMClassifierPromiseRef.current) {
  console.log('⏳ [Voice Mode] Awaiting LLM classifier promise...');
  await pendingLLMClassifierPromiseRef.current;
  pendingLLMClassifierPromiseRef.current = null;  // Clear after awaiting
  console.log('✅ [Voice Mode] LLM classifier promise resolved');
}

// Now safe to check pendingQueryIntentRef
const pendingIntent = pendingQueryIntentRef.current;
```

**Applied in both modes:**
- Text mode: Lines ~1590-1596 in `UnifiedAssistant.tsx`
- Voice mode: Lines ~2475-2485 in `UnifiedAssistant.tsx`

**Debug logs:**
- `⏳ [Text/Voice Mode] Awaiting LLM classifier promise...` - Waiting for classifier
- `✅ [Text/Voice Mode] LLM classifier promise resolved` - Classifier complete, safe to proceed

### Tool Functions Must Pass time_period

**CRITICAL:** When adding or modifying tool functions in `UnifiedAssistant.tsx`, always pass `time_period` and `date_filter` to webhook endpoints that support time filtering.

The LLM intent classifier extracts `timePeriod` and `dateFilter` from user queries, but these must be explicitly passed to the webhook:

```typescript
// CORRECT - passes time_period and date_filter
const voicePayload = await postJson('/api/elevenlabs/trade-summary', {
  symbol,
  time_period: timePeriod,
  date_filter: dateFilter
});

// WRONG - only passes symbol, ignores time period
const voicePayload = await postJson('/api/elevenlabs/trade-summary', { symbol });
```

**Tool functions that require time_period:**
- `get_trade_summary` - Extract with `getString(parameters, 'time_period')`
- `get_detailed_trades` - Extract with `getString(parameters, 'time_period')`
- `get_trade_stats` - Already implemented correctly
- `get_profitable_trades` - Check if implemented
- `get_time_based_trades` - Time period is the primary parameter
- `get_options` - Extract with `getString(parameters, 'time_period')`
- `get_fees` - Extract with `getString(parameters, 'time_period')`
- `get_account_balance` - For debit/credit balance queries

**Also update `fetchTradeData` function** for each card type (summary, detailed, stats, etc.) to include `time_period` and `date_filter` in the request body.

### Data Availability Suggestions (`src/lib/data-availability.ts`)

When queries return no data, the system suggests available data periods:

**Parseable Periods Whitelist:**
```typescript
const PARSEABLE_PERIODS = [
  'this week', 'last week',
  'this month', 'last month',
  'this year', 'last year',
  'the last two weeks', 'the last three months', 'the last six months'
];
```

**Deterministic Fallback:**
If LLM suggests non-parseable period (e.g., "Mar 30 to Sep 10, 2025"), system uses deterministic fallback based on data span.

**Key Functions:**
- `suggestDataPeriod(table, requestedPeriod, filters)` - Returns parseable period with actual amount
- `isParseablePeriod(period)` - Validates period is parseable
- `calculateDeterministicPeriod(earliest, latest)` - Fallback based on data span

### "Yes" Follow-Up Handling

Agent prompt (`prompts/finagent-neo.md`) includes rules for handling affirmative responses to suggestions:

```markdown
**When a tool returns "no data found" with a suggestion, and the user responds
with an affirmative, you MUST call the tool again with the SUGGESTED time period.**

**Affirmative patterns:** "Yes", "Sure", "Okay", "Yeah", "Please"
```

**DO NOT repeat suggestion from memory - MUST call tool again for full breakdown.**

### Follow-Up Query Handling (Critical)

When users ask follow-up questions like "What about September?" after "Apple trades in January", the agent MUST:

1. **Call the tool again** - Never answer from memory or context
2. **Preserve the symbol** - Include AAPL from the previous query
3. **Read the response verbatim** - Each time period may have completely different data

**Example of CORRECT flow:**
```
1. User: "Apple trades in January?"
2. Agent calls: get_time_based_trades(symbol: AAPL, time_period: January)
3. Tool returns: "No trades found"
4. Agent says: "No trades found for Apple in January"
5. User: "What about September?"
6. Agent calls: get_time_based_trades(symbol: AAPL, time_period: September) ← MUST CALL TOOL AGAIN
7. Tool returns: "1 trade found"
8. Agent says: "You had 1 trade for Apple in September"
```

**Follow-up patterns that ALWAYS require a new tool call:**
- "What about [time period]?"
- "How about [time period]?"
- "And for [time period]?"
- "[Month name]?" (e.g., "September?", "October?")

**CRITICAL:** The agent must NEVER infer "September probably has no trades too" - it MUST call the tool because January may have 0 trades but September may have 10 trades.

**Prompt Rules:** See `prompts/finagent-neo.md` Rules 9 and 10 in the `<core-rules>` section.

### Voice/UI Drift Prevention: Double Date Offset Fix

**Problem:** When user says "Yes" to a data suggestion, the UI would show different amounts than the voice agent spoke.

**Root Cause:** Suggestion follow-ups pass `dateFilter` with explicit `startDate`/`endDate` from `suggestDataPeriod()`. These dates are ALREADY demo-adjusted. If the UI endpoint calls `resolveDateFilter()`, it applies the date offset AGAIN, causing drift.

**Example:**
```
User: "What was my short interest for October?"
Voice: "$39 short interest for October" (correct)
User: "Yes" (to see suggested data for different period)
Without fix: UI shows $19 (wrong dates from double offset)
With fix: UI shows $39 (matches voice)
```

**Solution:** UI endpoints check for explicit `startDate`/`endDate` and use them directly:

```typescript
// For dateFilter with explicit startDate/endDate (e.g., from suggestion follow-up),
// use those dates DIRECTLY without applying offset again.
if (dateFilter && dateFilter.startDate && dateFilter.endDate) {
  resolved = {
    type: dateFilter.type === 'discrete' ? 'discrete' : 'range',
    startDate: dateFilter.startDate,
    endDate: dateFilter.endDate,
    description: dateFilter.description || timePeriod || 'selected period',
  };
} else if (timePeriod) {
  // Primary path: parse time period string (applies offset)
  resolved = parseTimePeriodToResolvedDates(timePeriod);
}
```

**Files with this fix:**
- `app/api/fees-ui/route.ts`
- `app/api/time-trades-ui/route.ts`
- `app/api/account-balance-ui/route.ts`

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

# Alpaca Markets (for real-time market data - already configured for trading)
ALPACA_API_KEY=<your-alpaca-key>
ALPACA_SECRET_KEY=<your-alpaca-secret>

# Alpha Vantage (for company fundamentals - free tier: 25 calls/day)
ALPHA_VANTAGE_API_KEY=<your-alpha-vantage-key>
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
| `get_market_data` | **Real-time market data** (Alpaca): stock quotes, option NBBO, price charts, news, trading halts |
| `get_fundamentals` | **Company fundamentals** (Alpha Vantage): overview, metrics (P/E, market cap), financials, earnings, dividends |
| `advanced_query` | Legacy flexible queries (use `get_options` for options) |

### `get_market_data` Tool (Real-Time Market Data)

Provides real-time market data from **Alpaca Markets API** using the free IEX feed.

**Webhook:** `app/api/elevenlabs/market-data/route.ts`
**Service:** `src/services/alpacaMarketData.ts`

| Query Type | Use Case | Example Query |
|------------|----------|---------------|
| `stock_quote` | Current stock price, bid/ask | "What's the price of Apple?", "Quote for TSLA" |
| `option_quote` | Option NBBO, Greeks, IV | "Quote for SPY Dec 200 call", "NBBO of AAPL 195 put" |
| `historical` | Price charts, OHLCV bars | "Show 3 week chart for AAPL", "Tesla 1 month chart" |
| `news` | Market news articles | "News for MSFT", "What's happening with Apple?" |
| `halt` | Trading halt status | "Is GME halted?", "Trading halt status" |

**Parameters:**
- `query_type` (required): One of `stock_quote`, `option_quote`, `historical`, `news`, `halt`
- `symbol` (required for quotes): Stock ticker
- `strike` (required for option_quote): Strike price
- `call_put` (required for option_quote): "call" or "put"
- `expiration` (optional for option_quote): "Dec 20", "January 17 2025"
- `chart_period` (optional for historical): "1 week", "3 weeks", "1 month", "1 year"

**Important Notes:**
- Uses IEX feed (free tier) - not SIP (requires paid subscription)
- Historical data before 2020 returns "not available" message
- Futures symbols (ES, NQ, etc.) return "not supported" message

**UI Components:**
- `StockQuoteCard` - Current price, bid/ask, volume, change
- `OptionQuoteCard` - Bid/ask with sizes, spread, mid, Greeks, IV

### `get_fundamentals` Tool (Company Fundamentals)

Provides company fundamental data from **Alpha Vantage API** (free tier: 25 calls/day).

**Webhook:** `app/api/elevenlabs/fundamentals/route.ts`
**Service:** `src/services/alphaVantageApi.ts`

| Query Type | Use Case | Example Query |
|------------|----------|---------------|
| `overview` | Company info, description, sector | "Tell me about Apple", "What does Tesla do?" |
| `metric` | Specific metrics (PE, market cap, etc.) | "PE ratio of Apple", "Market cap of Tesla" |
| `financials` | Income/balance/cash flow statements | "Revenue for Apple", "Balance sheet for MSFT" |
| `earnings` | Earnings dates and history | "When does Apple report earnings?" |
| `dividend` | Dividend yield and history | "Dividend yield for Apple", "Does Tesla pay dividends?" |

**Parameters:**
- `query_type` (required): One of `overview`, `metric`, `financials`, `earnings`, `dividend`
- `symbol` (required): Stock ticker
- `metric_type` (required for metric): One of: `pe_ratio`, `peg_ratio`, `market_cap`, `beta`, `eps`, `dividend_yield`, `52_week_high`, `52_week_low`, `book_value`, `price_to_book`, `price_to_sales`, `profit_margin`, `operating_margin`, `return_on_assets`, `return_on_equity`, `50_day_ma`, `200_day_ma`
- `statement_type` (optional for financials): `income`, `balance`, or `cashflow`

**Rate Limiting:**
- Free tier allows 25 API calls per day
- If rate limited, cached responses are used when available
- Agent responds with "API rate limited, try again later" when exhausted

**UI Components:**
- `CompanyOverviewCard` - Company info, sector, key metrics

## Troubleshooting

### ElevenLabs Voice Agent Disconnects Immediately

**Symptom:** WebSocket connects, agent sends greeting, then immediately disconnects with "WebSocket is already in CLOSING or CLOSED state" errors.

**First thing to check:** Open browser DevTools console and look for the disconnect reason:
```
ElevenLabs disconnected {
  "reason": "error",
  "message": "This request exceeds your quota limit."
}
```

**If you see "quota limit" error:**
- This is a **billing issue**, not a code bug
- Go to https://elevenlabs.io/app/billing to check quota usage
- Either wait for quota to reset (monthly) or upgrade the plan
- The voice agent will work normally once quota is available

**Other disconnect reasons to check:**
- `"reason": "timeout"` - Connection idle too long (check keepalive logic)
- `"reason": "user"` - User or code initiated disconnect
- Network errors - Check internet connectivity

### Debug Logging for Voice Connection

The `UnifiedAssistant.tsx` component includes debug logging for connection issues:
- `🔄 [Status Change]` - Shows status transitions (connecting → connected → disconnecting → disconnected)
- `🔴 [Disconnect]` - Shows disconnect reason, code, and message
- `🟢 Started keepalive interval` - Confirms keepalive is active

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

## Testing Guidelines

**IMPORTANT**: When testing LiveKit voice agent with Playwright, ALWAYS end the call/disconnect after testing to avoid running up credits. Use the 'End Call' or 'Disconnect' button after each test.

## ElevenLabs Connection Stability

### Auto-Reconnection

The `UnifiedAssistant` component includes automatic reconnection for dropped ElevenLabs connections:

- **Exponential backoff**: Reconnects after 2s, 4s, 8s delays
- **Max attempts**: 3 reconnection attempts before giving up
- **Smart detection**: Skips reconnection for quota/billing errors and intentional disconnects

```typescript
// Reconnection state (UnifiedAssistant.tsx lines 1717-1721)
const reconnectAttemptsRef = useRef(0);
const maxReconnectAttempts = 3;
const baseReconnectDelay = 2000; // Doubles each attempt
```

### Keepalive Mechanism

Per ElevenLabs documentation, a `user_activity` event is sent every 30 seconds to reset the turn timeout timer:

```typescript
// Keepalive interval (30s as per ElevenLabs docs)
keepaliveIntervalRef.current = setInterval(() => {
  conv.sendUserActivity();
}, 30000);
```

### Disconnect Handling

The `onDisconnect` handler categorizes disconnections:

| Disconnect Type | Auto-Reconnect | Console Log |
|----------------|----------------|-------------|
| Quota exceeded | No | `⚠️ [Disconnect] Quota/billing error detected` |
| User ended call | No | Normal disconnect |
| Agent ended call | No | Normal disconnect |
| Network/server error | Yes (up to 3x) | `🔄 [Reconnect] Attempting...` |

### Troubleshooting Connection Drops

1. **Check quota**: If you see "quota limit" errors, check ElevenLabs dashboard billing
2. **Console logs**: Look for `🔴 [Disconnect]` messages with reason details
3. **Reconnection logs**: `🔄 [Reconnect]` shows automatic reconnection attempts
4. **Keepalive logs**: `🔄 Sent keepalive ping` every 30 seconds confirms connection is active

## ElevenLabs Tool Schema Configuration

### CRITICAL: Parameter Placement in Tool Schemas

**Body parameters MUST be at the top level in ElevenLabs tool schemas, NOT nested inside other parameters.**

**Problem Example:**
```
User: "How many buy stock trades in Apple in Nov"
Expected: 4 stock trades
Actual: 9 trades (4 stock + 5 options)
```

**Root Cause:** `security_type` parameter was nested inside `date_filter` object instead of being a top-level body parameter. The webhook received an empty `security_type` and didn't filter.

**Correct Schema Structure:**
```
Body Parameters (top-level):
├── symbol (string)
├── time_period (string)
├── trade_type (string, enum: "buy", "sell")
├── security_type (string, enum: "stock", "option")  ← TOP LEVEL
└── date_filter (object)
    ├── type (string)
    ├── startDate (string)
    └── endDate (string)
```

**WRONG (nested - will not work):**
```
date_filter (object)
├── security_type (string)  ← WRONG - nested inside date_filter
├── type (string)
└── ...
```

### Tools Requiring `security_type` Parameter

These tools need `security_type` as a **top-level body parameter** with enum values `["stock", "option"]`:

| Tool | Purpose |
|------|---------|
| `get_time_based_trades` | Time-period trade queries |
| `get_detailed_trades` | Detailed trade history |

### How to Verify in ElevenLabs Dashboard

1. Go to ElevenLabs Conversational AI dashboard
2. Select agent → Tools section
3. Click on the tool (e.g., `get_time_based_trades`)
4. Check "Body" parameters section
5. Verify `security_type` is listed at the TOP LEVEL (not inside `date_filter`)
6. Verify enum values include: `stock`, `option`

### Webhook Parameter Extraction

The webhook extracts `security_type` from multiple possible locations:

```typescript
const securityType = body.security_type || body.parameters?.security_type ||
                     body.body?.security_type || body.body?.parameters?.security_type;
```

If `security_type` is nested inside `date_filter` in the schema, none of these paths will find it.
