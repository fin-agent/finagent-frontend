# FinAgent - AI-Powered Financial Trading Assistant

An intelligent financial agent that provides voice and text-based interaction for trading analysis, account management, and portfolio insights using cutting-edge AI technology.

## Overview

FinAgent is a sophisticated AI-powered trading assistant that combines:
- **Voice & Text Interaction** via ElevenLabs Conversational AI
- **Real-time Trade Analysis** with FIFO profit/loss calculations
- **Generative UI Components** that render rich data visualizations
- **Supabase PostgreSQL** for trade data storage
- **Next.js 15** with App Router architecture

---

## System Architecture

```mermaid
flowchart TB
    subgraph Client["Frontend (Next.js 15)"]
        UA[UnifiedAssistant Component]
        GU[Generative UI Components]
        UA --> GU
    end

    subgraph ElevenLabs["ElevenLabs Platform"]
        Agent[Conversational AI Agent]
        Voice[Voice Recognition]
        TTS[Text-to-Speech]
    end

    subgraph API["Next.js API Routes"]
        Tools["/api/elevenlabs/tools"]
        PT["/api/elevenlabs/profitable-trades"]
        TT["/api/elevenlabs/time-trades"]
        AQ["/api/elevenlabs/advanced-query"]
        TS["/api/trade-stats"]
        TUI["/api/profitable-trades-ui"]
        TTUI["/api/time-trades-ui"]
        AQUI["/api/advanced-query-ui"]
        Conv["/api/conversations"]
        Msg["/api/messages"]
    end

    subgraph Database["Supabase PostgreSQL"]
        TD[(TradeData)]
        AB[(AccountBalance)]
        AI[(AccountInfo)]
        C[(conversations)]
        M[(messages)]
    end

    UA <-->|WebSocket| Agent
    Agent -->|Webhook| Tools
    Agent -->|Webhook| PT
    Agent -->|Webhook| TT
    Agent -->|Webhook| AQ
    UA -->|REST| TUI
    UA -->|REST| AQUI
    UA -->|REST| TTUI
    UA -->|REST| TS
    UA -->|REST| Conv
    UA -->|REST| Msg

    Tools --> TD
    PT --> TD
    TT --> TD
    AQ --> TD
    TUI --> TD
    TTUI --> TD
    AQUI --> TD
    TS --> TD
    Conv --> C
    Msg --> M
```

---

## ElevenLabs Agent Configuration

### Agent Details
- **Name**: finagent-neo
- **Agent ID**: `agent_3101kbjqgdc0fkgvt8f1zw2hbvxv`
- **Voice ID**: `ys3XeJJA4ArWMhRpcX1D`

### Agent System Prompt

The agent is configured with a comprehensive system prompt that defines its personality, capabilities, and constraints:

#### Personality & Role
```
You are FinAgent, a helpful quantitative analyst assistant. You help users
understand their trading portfolio and answer questions about their stock
and option trades.
```

#### Number Formatting Rule (Critical for TTS)
```
# CRITICAL: NUMBER FORMATTING
NEVER spell out numbers. Always use numeric format exactly as received from tools:
- "$195.80" NOT "one hundred ninety five dollars and eighty cents"
- "227 shares" NOT "two hundred twenty seven shares"
- "August 13, 2025" NOT "August thirteenth, two thousand twenty five"
```

This ensures the text-to-speech engine receives clean numeric data for natural pronunciation.

#### Agent-Level Symbol Normalization
The agent converts company names to ticker symbols before calling tools:
```
When users mention company names, convert them to the appropriate ticker symbol:
- Apple → AAPL
- Google/Alphabet → GOOGL
- Amazon → AMZN
- Microsoft → MSFT
- Tesla → TSLA
- Nvidia → NVDA
- Meta/Facebook → META
```

#### Tone & Communication Style
- **Clear, professional, and informative**
- **Friendly and approachable**, but concise
- **Free of jargon**, unless explicitly requested
- Focused on **accuracy and clarity**

#### Guardrails
| ✅ Allowed | ❌ Not Allowed |
|-----------|---------------|
| Factual portfolio data | Investment advice |
| Trade history & statistics | Personal recommendations |
| P&L calculations | Speculation or opinions |
| Market data (quotes, volume) | Disclosing internal tools |

#### Query Categories (Filtering Rules)
The agent only processes queries in these categories:
- Account balances and equity summaries
- Historical or current trades and orders
- Realized / unrealized P&L
- Fees, commissions, and interest data
- Market data (quotes, volume, fundamentals)
- Position and exposure breakdowns
- Trade statistics (highest/lowest prices, averages)

### Available Tools

The ElevenLabs agent has access to webhook tools that query trade data:

| Tool Name | Endpoint | Description |
|-----------|----------|-------------|
| `get_trade_summary` | `/api/elevenlabs/tools` | Get count of stock and option trades for a symbol |
| `get_detailed_trades` | `/api/elevenlabs/detailed-trades` | Get all trades summary (stocks + options, buys + sells) |
| `get_trade_stats` | `/api/elevenlabs/trade-stats` | Get highest/lowest prices, averages for a symbol |
| `get_profitable_trades` | `/api/elevenlabs/profitable-trades` | Calculate profitable trades using FIFO matching |
| `get_time_based_trades` | `/api/elevenlabs/time-trades` | Get trades for a time period (last week, yesterday, Nov 18th) |
| `get_options` | `/api/elevenlabs/options` | **Dedicated options tool** with 5 query types (see below) |
| `get_account_balance` | `/api/elevenlabs/account-balance` | Account balance, equity, buying power, margin info |
| `get_fees` | `/api/elevenlabs/fees` | Commissions, interest charges, locate fees, short interest |
| `advanced_query` | `/api/elevenlabs/advanced-query` | Legacy flexible queries (use `get_options` for options) |

#### Tool Usage Guidelines (from System Prompt)

| Tool | Use When User Asks... | Example Queries |
|------|----------------------|-----------------|
| `get_trade_summary` | General trade counts | "How many trades do I have for Apple?", "Show me my NVDA trades" |
| `get_detailed_trades` | Position details, cost basis | "What's my position in Tesla?", "How much did I spend on Apple?" |
| `get_trade_stats` | Price extremes, averages | "Highest price I sold NVDA at?", "Average sell price for Apple?" |
| `get_profitable_trades` | Realized gains, profit | "Show profitable trades on Apple", "How much profit on NVDA?" |
| `get_time_based_trades` | Trades for a time period | "Show trades for last week", "Yesterday's trades", "Trades on November 18th" |
| `advanced_query` | Option-specific queries | "Show all short calls on Tesla last month", "What's my highest strike put?" |

**Important**: The agent is instructed to always pass ticker symbols (AAPL, GOOGL) not company names to tools.

#### `get_options` Tool (Dedicated Options Queries)

The preferred tool for ALL option-related queries. Has 5 query types:

| Query Type | Use Case | Example |
|------------|----------|---------|
| `bulk` | Multiple option trades | "Show all short calls on TSLA last month" |
| `last` | Single most recent trade | "Show the last call option I bought on AAPL" |
| `expiring` | Options by expiration date | "Options expiring tomorrow" |
| `highest_strike` | Single trade with highest/lowest strike | "Highest strike call I sold on AAPL this year" |
| `total_premium` | Aggregated premium sum | "Total premium paid for SPY options last 12 months" |

**Parameters:**
- `query_type` (required): One of `bulk`, `last`, `expiring`, `highest_strike`, `total_premium`
- `symbol` (optional): Stock ticker (e.g., "TSLA", "AAPL")
- `trade_type` (optional): "buy" or "sell"
- `call_put` (optional): "call" or "put"
- `time_period` (optional): Natural language time period
- `expiration` (optional): "tomorrow", "this week", "this month"

#### `get_account_balance` Tool (Account Queries)

Returns account balance, equity, buying power, and margin information.

| Query Type | Use Case | Example Query |
|------------|----------|---------------|
| `cash_balance` | Cash available | "How much can I withdraw?" |
| `cash_and_equity` | Cash + account equity | "How much money do I have?" |
| `buying_power` | Day trading BP | "What is my buying power?" |
| `account_summary` | Full overview (default) | "Show my account summary" |
| `nlv` | Net liquidation value | "What is my NLV?" |
| `overnight_margin` | Margin status | "What's my overnight margin?" |
| `market_value` | Position market values | "Market value of my positions" |
| `debit_balances` | Debit balance trends | "Debit balances for September" |
| `credit_balances` | Credit balance trends | "Credit balances for the month" |

**Parameters:**
- `query_type` (required): One of the types above
- `time_period` (required for `debit_balances`/`credit_balances`): Time period for trends

#### `get_fees` Tool (Fees & Interest Queries)

Returns commissions, interest charges, and locate fees.

| Fee Type | Source Table | Use Case | Example Query |
|----------|--------------|----------|---------------|
| `commission` | TradeData | Trading commissions | "What were my fees paid last month?" |
| `credit_interest` | FeesAndInterest | Interest earned | "How much credit interest this month?" |
| `debit_interest` | FeesAndInterest | Margin interest charged | "How much debit interest last week?" |
| `locate_fee` | FeesAndInterest | Short locate fees (with symbol) | "How much to borrow MTEN stock this year?" |
| `short_interest` | FeesAndInterest | Short interest charges | "What is my short interest for October?" |

**Parameters:**
- `fee_type` (required): One of `commission`, `credit_interest`, `debit_interest`, `locate_fee`, `short_interest`
- `time_period` (required): Natural language time period
- `symbol` (optional): For `locate_fee` and `short_interest` queries

**Note:** `short_interest` maps to `LocateFee` type in the database. Both represent borrow fees for shorting stocks.

### Connection Stability

The voice agent includes automatic reconnection and keepalive mechanisms:

| Feature | Description |
|---------|-------------|
| **Auto-Reconnect** | Up to 3 attempts with exponential backoff (2s, 4s, 8s) |
| **Keepalive** | `user_activity` ping every 30 seconds (per ElevenLabs docs) |
| **Smart Detection** | Skips reconnection for quota/billing errors |

**Console Logs:**
- `🔄 [Reconnect] Attempting reconnection 1/3...` - Auto-reconnect in progress
- `⚠️ [Disconnect] Quota/billing error detected` - Check ElevenLabs billing
- `🔄 Sent keepalive ping to ElevenLabs` - Connection is healthy

### Tool Webhook Flow

```mermaid
sequenceDiagram
    participant User
    participant ElevenLabs as ElevenLabs Agent
    participant Webhook as Next.js Webhook
    participant DB as Supabase
    participant UI as Generative UI

    User->>ElevenLabs: "Show profitable trades for Google"
    ElevenLabs->>ElevenLabs: Extract intent & symbol
    ElevenLabs->>Webhook: POST /api/elevenlabs/profitable-trades
    Note over Webhook: {symbol: "Google"}
    Webhook->>Webhook: normalizeSymbol("Google") → "GOOGL"
    Webhook->>DB: Query buy trades (TradeType='B')
    Webhook->>DB: Query sell trades (TradeType='S')
    Webhook->>Webhook: FIFO matching algorithm
    Webhook-->>ElevenLabs: {response: "2 profitable trades..."}
    ElevenLabs-->>User: Voice response
    User->>UI: Message displayed
    UI->>UI: detectProfitableTrades(message)
    UI->>Webhook: POST /api/profitable-trades-ui
    Webhook-->>UI: {trades: [...], totalProfit: 5005}
    UI->>UI: Render ProfitableTrades card
```

---

## FIFO Trade Matching Algorithm

The profitable trades calculation uses **First-In-First-Out (FIFO)** methodology to match buy and sell trades:

```mermaid
flowchart LR
    subgraph Buys["Buy Trades (Chronological)"]
        B1["Buy 1: 100 shares @ $171.20<br/>2025-09-30"]
        B2["Buy 2: 80 shares @ $175.60<br/>2025-10-14"]
        B3["Buy 3: 50 shares @ $180.00<br/>2025-10-20"]
    end

    subgraph Sells["Sell Trades (Chronological)"]
        S1["Sell 1: 100 shares @ $189.70<br/>2025-10-28"]
        S2["Sell 2: 80 shares @ $191.20<br/>2025-11-11"]
    end

    subgraph Matches["FIFO Matched Pairs"]
        M1["Match 1: B1 → S1<br/>Profit: $1,850"]
        M2["Match 2: B2 → S2<br/>Profit: $1,248"]
    end

    B1 --> M1
    S1 --> M1
    B2 --> M2
    S2 --> M2
```

### Algorithm Implementation

```typescript
// 1. Fetch and sort trades chronologically
const buyTrades = await supabase
  .from('TradeData')
  .select('*')
  .eq('TradeType', 'B')
  .order('Date', { ascending: true })
  .order('TradeID', { ascending: true });

const sellTrades = await supabase
  .from('TradeData')
  .select('*')
  .ilike('TradeType', 'S')
  .order('Date', { ascending: true });

// 2. Match by security type (Stock vs Option) using proper FIFO
for (const secType of ['S', 'O']) {
  // Track which buys have been matched
  const buys = buyTrades
    .filter(t => t.SecurityType === secType)
    .map(t => ({ ...t, matched: false }));
  const sells = sellTrades.filter(t => t.SecurityType === secType);

  // For each sell, find earliest unmatched buy that occurred BEFORE the sell
  for (const sell of sells) {
    const sellDate = new Date(sell.Date);

    const matchingBuy = buys.find(buy =>
      !buy.matched && new Date(buy.Date) <= sellDate
    );

    if (matchingBuy) {
      matchingBuy.matched = true;

      const buyPrice = parseFloat(matchingBuy.StockTradePrice);
      const sellPrice = parseFloat(sell.StockTradePrice);
      const quantity = parseFloat(matchingBuy.StockShareQty);

      // Profit calculated from actual prices
      const profitLoss = (sellPrice - buyPrice) * quantity;

      matchedTrades.push({
        securityType: secType === 'S' ? 'Stock' : 'Option',
        buyDate: matchingBuy.Date,
        sellDate: sell.Date,
        quantity,
        buyPrice,
        sellPrice,
        profitLoss
      });
    }
  }
}

// Only include trades where sellPrice > buyPrice (actual profit)
const profitableTrades = matchedTrades.filter(t => t.profitLoss > 0);
```

### Key FIFO Rules

1. **Chronological matching**: Each sell is matched with the earliest unmatched buy
2. **Temporal constraint**: A sell can only match a buy that occurred on or before the sell date
3. **Price-based profit**: Profit = `(sellPrice - buyPrice) × quantity`
4. **True profitability**: Only trades where `sellPrice > buyPrice` are considered profitable

---

## Option Premium Math

Option calculations follow standard options math where **1 contract = 100 shares**:

### Key Calculations

| Metric | Formula | Example |
|--------|---------|---------|
| **Total Premium** | `premium_per_share × contracts × 100` | $3.69 × 226 × 100 = $83,394 |
| **Shares Covered** | `contracts × 100` | 226 contracts = 22,600 shares |
| **Average Premium per Share** | `total_premium / contracts / 100` | $83,509 / 226 / 100 = $3.69 |

### Important Distinction

- **OptionTradePremium** in the database is the **per-share price** (e.g., $3.69)
- **Per-contract premium** = per-share price × 100 (e.g., $3.69 × 100 = $369)
- The agent response says "average premium **per share**" to be precise

---

## Date Utilities & Demo Data Mapping

The application uses **demo trade data** with future dates (2025) that are dynamically mapped to display as recent dates relative to today. This allows the demo to always show relevant "recent" trades without needing to update the database.

### Why Demo Dates?

The demo database contains trade data with dates centered around `2025-11-20`. Without date mapping:
- "Yesterday's trades" would return nothing (the actual date doesn't exist in demo data)
- "Last week" would show ancient trades or nothing at all
- Time-based queries would be useless for demos

The date utility system solves this by creating a **bidirectional mapping** between real dates and demo dates.

### Date Offset System

The core concept is a **date offset** - the number of days between the demo "today" (`2025-11-20`) and the actual current date.

```mermaid
flowchart LR
    subgraph DemoData["Database (Demo)"]
        DB["2025-11-20<br/>(DEMO_TODAY)"]
    end

    subgraph Offset["Date Offset Calculation"]
        CALC["offset = DEMO_TODAY - TODAY<br/>e.g., ~351 days"]
    end

    subgraph Display["User Display"]
        DISP["Dec 4, 2024<br/>(Actual Today)"]
    end

    DB --> CALC --> DISP
```

**How it works:**
1. `DEMO_TODAY` is set to `2025-11-20` (the "today" in the demo timeline)
2. The offset is calculated: `offset = DEMO_TODAY - actualToday`
3. **For queries**: Add offset to real dates → get DB dates
4. **For display**: Subtract offset from DB dates → get display dates

### Bidirectional Date Conversion

```mermaid
flowchart TB
    subgraph UserQuery["User Query: 'trades yesterday'"]
        REAL["Actual Yesterday<br/>Dec 3, 2024"]
    end

    subgraph Conversion["Date Conversion"]
        ADD["+ 351 days offset"]
        SUB["- 351 days offset"]
    end

    subgraph Database["Database Query"]
        DEMO["Demo Date<br/>2025-11-19"]
    end

    subgraph Display["UI Display"]
        DISP["Shows: 'Yesterday'<br/>Dec 3, 2024"]
    end

    REAL -->|realDateToDemoDate| ADD --> DEMO
    DEMO -->|demoDateToRealDate| SUB --> DISP
```

### Core Functions (`src/lib/date-utils.ts`)

| Function | Purpose | Example |
|----------|---------|---------|
| `getDateOffset()` | Calculate days between `DEMO_TODAY` and actual today | Returns `351` if actual today is Dec 4, 2024 |
| `realDateToDemoDate(date)` | Convert real date → DB date (add offset) | Dec 3, 2024 → 2025-11-19 |
| `demoDateToRealDate(dbDate)` | Convert DB date → real date (subtract offset) | 2025-11-19 → Dec 3, 2024 |
| `formatDisplayDate(dbDate)` | Format DB date as relative string | 2025-11-19 → "Yesterday" |
| `formatCalendarDate(dbDate)` | Format DB date as calendar string | 2025-11-19 → "Dec 3, 2024" |
| `formatDateRange(start, end)` | Format DB date range for display | "Nov 27 - Dec 3" |
| `getDayOfWeek(dbDate)` | Get day name from DB date | 2025-11-18 → "Monday" |
| `getDemoToday()` | Get the `DEMO_TODAY` constant | "2025-11-20" |
| `formatDateForDB(date)` | Format a Date object as YYYY-MM-DD | Date → "2025-11-20" |

### Implementation Details

```typescript
// The anchor date in demo database representing "today"
const DEMO_TODAY = '2025-11-20';

// Calculate offset (positive when demo is in future)
export function getDateOffset(): number {
  const actualToday = new Date();
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  const demoToday = new Date(year, month - 1, day);
  const diffMs = demoToday.getTime() - actualToday.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Convert real date → DB date (for queries)
export function realDateToDemoDate(realDate: Date): Date {
  const offset = getDateOffset();
  const demoDate = new Date(realDate);
  demoDate.setDate(demoDate.getDate() + offset); // ADD offset
  return demoDate;
}

// Convert DB date → display date (for UI)
export function demoDateToRealDate(demoDateStr: string): Date {
  const offset = getDateOffset();
  const [year, month, day] = demoDateStr.split('-').map(Number);
  const demoDate = new Date(year, month - 1, day);
  demoDate.setDate(demoDate.getDate() - offset); // SUBTRACT offset
  return demoDate;
}
```

### Natural Language Date Parsing (`src/lib/date-parser.ts`)

The date parser converts natural language time expressions into database-ready date ranges.

#### Prefix Stripping

ElevenLabs often sends time periods with prepositions like "in October", "for last week", "during September". The parser automatically strips these prefixes before processing:

```typescript
// Handles: "in October" → "october"
// Handles: "for last week" → "last week"
// Handles: "during September" → "september"
```

#### Supported Time Expressions

| Category | Examples | Parsed Result |
|----------|----------|---------------|
| **Relative Days** | "today", "yesterday" | Single date range |
| **Relative Ranges** | "last week", "this week", "last month", "this month" | Multi-day range |
| **N Days** | "last 5 days", "past 10 days" | N-day range ending today |
| **Trading Days** | "last 3 trading days", "past five trading days" | Approximated calendar range (×7/5) |
| **Day Names** | "Monday", "Tuesday", "last Friday" | Most recent occurrence |
| **Specific Dates** | "November 18th", "Nov 18", "December 3rd" | Exact calendar date |
| **Spelled Numbers** | "last five days", "past twenty days" | Converts words to numbers |
| **Single Months** | "October", "in September", "August" | Full calendar month |
| **Date Ranges** | "June 1st to 7th", "November 15 to December 5" | Start-to-end date range |
| **Multi-Month** | "August and September", "August through October" | Multi-month range |
| **Discrete Dates** | "July 1st and August 1st" | Array of specific dates |

#### Key Functions

| Function | Purpose |
|----------|---------|
| `parseTimeExpression(expr)` | Parse natural language → DateRange with DB-adjusted dates |
| `parseTimePeriodToResolvedDates(period)` | Extended parser for date ranges, discrete dates, and month names |
| `extractTimePeriodFromQuery(query)` | Extract time portion from a full query ("trades for last week" → "last week") |
| `isTimeBasedQuery(query)` | Check if query contains a time expression |
| `resolveDateFilter(filter)` | Resolve LLM DateFilter to database-ready dates |

#### DateRange Interface

```typescript
interface DateRange {
  startDate: string;   // YYYY-MM-DD (DB-adjusted)
  endDate: string;     // YYYY-MM-DD (DB-adjusted)
  description: string; // Human-readable ("last week")
  tradingDays: number; // Calendar days in range
}
```

### Time-Based Query Flow

Complete flow from user query to displayed results:

```mermaid
sequenceDiagram
    participant User
    participant Agent as ElevenLabs Agent
    participant API as /api/elevenlabs/time-trades
    participant Parser as date-parser.ts
    participant Utils as date-utils.ts
    participant DB as Supabase

    User->>Agent: "Show trades for last week"
    Agent->>API: POST {time_period: "last week", symbol: "GOOGL"}

    Note over API,Parser: Step 1: Parse time expression
    API->>Parser: parseTimeExpression("last week")
    Parser->>Utils: getDateOffset() → 351
    Parser->>Parser: Calculate real dates (Dec 4-10)
    Parser->>Parser: Add offset → demo dates
    Parser-->>API: {startDate: "2025-11-13", endDate: "2025-11-19"}

    Note over API,DB: Step 2: Query database
    API->>DB: SELECT * WHERE Date BETWEEN '2025-11-13' AND '2025-11-19'
    DB-->>API: trades[] (with demo dates)

    Note over API,Utils: Step 3: Format for display
    API->>Utils: formatDateRange("2025-11-13", "2025-11-19")
    Utils-->>API: "Nov 27 - Dec 3"
    API->>Utils: formatDisplayDate(trade.Date)
    Utils-->>API: "3 days ago"

    Note over API,User: Step 4: Return response
    API-->>Agent: {response: "5 trades last week", displayRange: "Nov 27 - Dec 3"}
    Agent-->>User: Voice: "You executed 5 trades last week"
```

### Usage Examples

#### Querying with Time Expressions
```typescript
// User asks: "Show my Apple trades from last week"
const parsed = parseTimeExpression("last week");
// Returns: { startDate: "2025-11-13", endDate: "2025-11-19", ... }

// Query database with demo dates
const trades = await supabase
  .from('TradeData')
  .select('*')
  .gte('Date', parsed.dateRange.startDate)
  .lte('Date', parsed.dateRange.endDate);
```

#### Displaying Dates to Users
```typescript
// Trade from database has: Date = "2025-11-18"
const displayDate = formatDisplayDate("2025-11-18");
// Returns: "2 days ago" (when actual today is Dec 6, 2024)

const calendarDate = formatCalendarDate("2025-11-18");
// Returns: "Dec 4, 2024"
```

### Important Notes

1. **Timezone Handling**: All dates are parsed as local dates (not UTC) to avoid timezone-related off-by-one errors
2. **Future Date Logic**: When parsing "November 18th", if that date is in the future, the parser assumes the user means last year
3. **Trading Days**: "Last 5 trading days" approximates to ~7 calendar days (5 × 7/5) since the DB doesn't track market holidays
4. **Offset Recalculation**: The offset is recalculated on each call to handle date changes during long sessions

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

#### 2. Relative Time Queries (With Offset)
For queries like "last month", "yesterday", "last week", date offset IS applied to map real dates to demo database dates using `formatCalendarDate()`.

#### Decision Logic
```typescript
// If timePeriod exists ("last month"), use offset-adjusted dates
// If no timePeriod (full year query), use raw dates
const formatDate = timePeriodDescription ? formatCalendarDate : formatRawDate;
```

This ensures the voice agent says the exact same date that appears in the UI cards.

### Voice/UI Trades Synchronization

For "show trades" queries, both voice and UI return **identical summary metrics**:

| Metric | Description |
|--------|-------------|
| `tradeCount` | Total trades (stocks + options) |
| `stockCount` / `optionCount` | Breakdown by security type |
| `buyCount` / `sellCount` | Breakdown by trade type |
| `totalQuantity` | Shares + contracts combined |
| `totalValue` | Sum of absolute NetAmounts |
| `avgValue` | Average value per trade |

**Voice Response Example:**
> "For AAPL, you have 15 total trades: 10 stock trades and 5 option trades. 8 buys and 7 sells. Total quantity: 792 (525 shares and 267 contracts). Total value: $170,626.45 with an average of $11,375.10 per trade."

**UI Card:** TradesTable displays the same summary values in the header.

### Voice/UI Sync: Single-Fetch Architecture

To prevent drift between what the voice says and what the UI shows, all voice webhooks return **both** `response` (for TTS) **and** `uiData` (for UI rendering) in a single API call:

```mermaid
sequenceDiagram
    participant User
    participant Client as UnifiedAssistant
    participant Webhook as Voice Webhook
    participant DB as Supabase

    User->>Client: "Show debit interest last month"
    Client->>Webhook: POST /api/elevenlabs/fees
    Webhook->>DB: Query FeesAndInterest
    Webhook-->>Client: { response: "$125.75...", uiData: {...} }
    Client->>Client: Voice speaks response
    Client->>Client: UI renders uiData
    Note over Client: Voice and UI show SAME data
```

**Key Principle:** Single source of truth - the voice webhook computes the data once, and both voice and UI use that exact same data.

### Data Availability Suggestions

When a query returns no data for the requested time period, the system proactively suggests available data:

```
User: "Debit interest last week"
Voice: "No debit interest found for last week. However, I found $402.00 for the last six months. Would you like to know more about that?"
```

**Parseable Period Validation:**

The system ensures suggested time periods are always parseable by the date parser:

| Suggested Period | Why It's Valid |
|-----------------|----------------|
| `this week`, `last week` | Relative week references |
| `this month`, `last month` | Relative month references |
| `the last two weeks` | Explicit duration |
| `the last six months` | Explicit duration |

**Deterministic Fallback:**

If the LLM suggests a non-parseable period (e.g., "Mar 30 to Sep 10, 2025"), the system falls back to a deterministic suggestion based on data span:

```typescript
if (dataSpanDays <= 7) return 'this week';
else if (dataSpanDays <= 14) return 'the last two weeks';
else if (dataSpanDays <= 31) return 'this month';
else if (dataSpanDays <= 90) return 'the last three months';
else if (dataSpanDays <= 180) return 'the last six months';
else return 'this year';
```

### "Yes" Follow-Up Handling

When users respond affirmatively to a suggestion, the agent calls the tool again with the suggested period:

```
User: "Debit interest last week"
Agent: "No data found. I found $402 for the last six months. Would you like to know more?"
User: "Yes"
Agent: [calls get_fees with time_period: "last six months"]
Agent: "The total debit interest for the last six months is $402 across 13 transactions."
```

**This ensures the UI card appears with full transaction breakdown.**

### Voice/UI Drift Prevention

**Key Principle:** The voice agent is the source of truth. The UI must always display exactly what the voice says.

#### Common Drift Causes and Solutions

| Cause | Solution |
|-------|----------|
| Double date offset in suggestion follow-ups | Use explicit `startDate`/`endDate` directly, don't call `resolveDateFilter()` |
| Regex detection order | Check `short_interest` before `debit_interest`, bulk options before "last option" |
| Different data sources | Voice webhooks return `uiData` for UI to use directly |
| Symbol extraction failures | Wait for LLM classification before fetching UI data |

#### Double Date Offset Fix

When user says "Yes" to a data suggestion, the `dateFilter` contains pre-adjusted demo dates from `suggestDataPeriod()`. UI endpoints must use these directly:

```typescript
// CORRECT: Use explicit dates directly
if (dateFilter?.startDate && dateFilter?.endDate) {
  resolved = {
    startDate: dateFilter.startDate,
    endDate: dateFilter.endDate,
    description: dateFilter.description,
  };
}

// WRONG: This applies offset twice
resolved = resolveDateFilter(dateFilter); // Don't do this!
```

**Files with this pattern:**
- `app/api/fees-ui/route.ts`
- `app/api/time-trades-ui/route.ts`
- `app/api/account-balance-ui/route.ts`

---

## Database Schema

```mermaid
erDiagram
    AccountInfo ||--o{ TradeData : has
    AccountInfo ||--o{ AccountBalance : has
    AccountInfo ||--o{ FeesAndInterest : has
    AccountInfo ||--o{ conversations : has
    conversations ||--o{ messages : contains

    AccountInfo {
        varchar AccountCode PK
        varchar AccountType
        varchar AccountName
        varchar AcctHolderName
        date AccountOpened
    }

    TradeData {
        bigint TradeID PK
        varchar AccountCode FK
        date Date
        varchar TradeType "B=Buy, S=Sell"
        varchar SecurityType "S=Stock, O=Option"
        varchar Symbol
        varchar UnderlyingSymbol
        numeric StockTradePrice
        numeric StockShareQty
        numeric OptionTradePremium
        numeric OptionContracts
        numeric NetAmount
        numeric Commission
        date Expiration
        numeric Strike
        varchar CallPut
    }

    AccountBalance {
        varchar AccountCode PK
        date Date PK
        numeric CashBalance
        numeric StockLMV
        numeric AccountEquity
        numeric DayTradingBP
    }

    FeesAndInterest {
        bigint id PK
        varchar AccountCode FK
        date Date
        varchar Type "CreditInt, DebitInt, LocateFee"
        varchar Symbol "For locate/short fees"
        numeric Amount
    }

    conversations {
        uuid id PK
        varchar account_code FK
        varchar title
        timestamp created_at
        jsonb metadata
    }

    messages {
        uuid id PK
        uuid conversation_id FK
        varchar role "user|assistant|system"
        text content
        varchar source "text|voice"
        timestamp created_at
    }
```

---

## Generative UI Components

The application renders rich UI cards based on the agent's responses:

### Component Detection Flow

```mermaid
flowchart TD
    MSG[Agent Message Received] --> EXT[extractSymbolOrCompany]
    EXT --> |Symbol Found| DET{Detect Message Type}
    EXT --> |No Symbol| SKIP[No UI Card]

    DET --> |"profitable trades"| PROF[detectProfitableTrades]
    DET --> |"highest/lowest price"| STATS[detectTradeStats]
    DET --> |"trades found"| TABLE[Show TradesTable]

    PROF --> |true| FETCH1[Fetch /api/profitable-trades-ui]
    STATS --> |true| FETCH2[Fetch /api/trade-stats]

    FETCH1 --> CARD1[ProfitableTrades Card]
    FETCH2 --> CARD2[TradeStats Card]
    TABLE --> CARD3[TradesTable Card]
```

### Available Components

| Component | Trigger Patterns | Data Displayed |
|-----------|-----------------|----------------|
| `ProfitableTrades` | "profitable trades", "profit of $X", "most profitable" | Total profit, trade count, individual trade details |
| `TradeStats` | "highest price", "lowest sold", "average" (full year) | High/low prices with dates, averages, totals for the year |
| `TimePeriodStats` | "highest price last month", "average price last week" (with high/low) | High/low/average prices for specific time periods |
| `AveragePrice` | "average price was $X", "paid an average of $X" (simple average only) | Focused average price display with range visualization |
| `TradesTable` | "found X trades", "here are your trades" | Full trade history with summary (stocks/options, buys/sells, totals) |
| `TradeSummary` | "X stock trades and Y option trades" | Quick trade count summary |
| `TimeBasedTrades` | "trades last week", "executed X trades yesterday" | Time period summary, trade list with display dates |
| `AdvancedOptionsTable` | "sold N call option contracts", "across N trades" (bulk options) | Options table with strike, expiration, premium, aggregations |
| `TradeQueryCard` | Displayed with query results | Shows active filters (symbol, date range, call/put, etc.) |
| `HighestStrikeCard` | "highest strike", "maximum strike" | Single highest/lowest strike trade details |
| `TotalPremiumCard` | "total premium", "collected/paid total" | Total premium aggregated across trades |
| `ExpiringOptionsTable` | "options expiring tomorrow/this week" | Options grouped by expiration with pagination, parsed symbols, urgency indicators |
| `LastOptionTradeCard` | "last/most recent call/put option" (single trade) | Most recent option trade details |
| `AccountSummary` | "cash balance", "buying power", "account equity", "margin" | Account balances, equity, buying power, margin status, position values (tabular layout) |
| `FeesSummary` | "commission", "fees", "interest" | Trading commissions, credit/debit interest, locate fees with breakdown |

### Terminal Luxe Design System

All generative UI components use a consistent dark theme design system:

| Element | Color |
|---------|-------|
| Void background | `#000000` |
| Card background | `#0f0f0f` |
| Border | `#1a1a1a` |
| Profit/Positive | `#00ff88` |
| Loss/Negative | `#ff4466` |
| Call options | `#00d4ff` |
| Put options | `#ff66b2` |
| Gold accent | `#ffd700` |

Components use inline React styles rather than Tailwind to avoid JIT compilation issues with dynamically generated class names.

---

## API Routes

### ElevenLabs Webhook Endpoints

#### `POST /api/elevenlabs/profitable-trades`

Called by ElevenLabs agent to get profitable trades for a symbol.

**Request:**
```json
{
  "symbol": "Google"
}
```

**Response:**
```json
{
  "response": "Found 2 profitable trades for GOOGL with a total profit of $5005.00. Trade 1: Stock, bought 2025-09-30 at $171.20, sold 2025-10-28 at $189.70, profit $4113.40."
}
```

#### `POST /api/elevenlabs/tools`

Multi-tool endpoint that routes based on `tool_name`:

**Request:**
```json
{
  "tool_name": "get_trade_stats",
  "parameters": {
    "symbol": "NVDA",
    "trade_type": "sell",
    "year": 2025
  }
}
```

### UI Data Endpoints

#### `POST /api/profitable-trades-ui`

Returns structured data for the ProfitableTrades component.

**Response:**
```json
{
  "symbol": "GOOGL",
  "totalProfitableTrades": 2,
  "totalProfit": 5005,
  "trades": [
    {
      "securityType": "Stock",
      "buyDate": "2025-09-30",
      "sellDate": "2025-10-28",
      "quantity": 120,
      "buyPrice": 171.20,
      "sellPrice": 189.70,
      "profitLoss": 4113.40
    }
  ]
}
```

#### `POST /api/trade-stats`

Returns trade statistics for UI card rendering.

#### `POST /api/elevenlabs/time-trades`

Called by ElevenLabs agent to get trades for a specific time period.

**Request:**
```json
{
  "time_period": "last week",
  "symbol": "GOOGL",
  "trade_type": "buy"
}
```

**Response:**
```json
{
  "response": "You executed 5 trades for GOOGL last week over 7 trading days. Would you like a detailed list?",
  "data": {
    "tradeCount": 5,
    "stockCount": 4,
    "optionCount": 1,
    "timePeriod": "last week",
    "displayRange": "Nov 27 - Dec 3",
    "tradingDays": 7,
    "startDate": "Nov 27",
    "endDate": "Dec 3",
    "symbol": "GOOGL",
    "totalValue": 50000.00,
    "trades": [...]
  }
}
```

**Supported Time Periods:**
- Relative: `today`, `yesterday`, `last week`, `this month`
- N Days: `last 5 days`, `past 10 trading days`
- Day Names: `Monday`, `Tuesday`, `last Friday`
- Specific Dates: `November 18th`, `Nov 18`, `December 3rd`

#### `POST /api/time-trades-ui`

Returns structured data for the TimeBasedTrades UI component.

#### `POST /api/elevenlabs/fees`

Called by ElevenLabs agent to get fees and interest charges.

**Request:**
```json
{
  "fee_type": "short_interest",
  "time_period": "October",
  "symbol": "MTEN"
}
```

**Response:**
```json
{
  "response": "Your total short interest for October is $39.00 across 4 transactions",
  "uiData": {
    "feeType": "short_interest",
    "totalAmount": 39.00,
    "transactionCount": 4,
    "timePeriod": "October",
    "symbol": "MTEN",
    "breakdown": [
      { "date": "2025-10-15", "amount": 12.50, "symbol": "MTEN" },
      { "date": "2025-10-08", "amount": 10.25, "symbol": "MTEN" }
    ]
  }
}
```

**Fee Type to Database Type Mapping:**
| Fee Type | DB Type | Source |
|----------|---------|--------|
| `commission` | Commission field | TradeData table |
| `credit_interest` | CreditInt | FeesAndInterest table |
| `debit_interest` | DebitInt | FeesAndInterest table |
| `locate_fee` | LocateFee | FeesAndInterest table |
| `short_interest` | LocateFee | FeesAndInterest table |

#### `POST /api/fees-ui`

Returns structured data for the FeesSummary UI component.

#### `POST /api/elevenlabs/account-balance`

Called by ElevenLabs agent to get account balance information.

**Request:**
```json
{
  "query_type": "debit_balances",
  "time_period": "September"
}
```

**Response:**
```json
{
  "response": "Your average debit balance for the month of September is $15250. The highest debit balance was on September 15th in the amount of $18500. The lowest debit balance was on September 28th in the amount of $12100",
  "uiData": {
    "queryType": "debit_balances",
    "date": "2025-09-30",
    "balanceTrend": {
      "average": 15250,
      "highest": 18500,
      "highestDate": "2025-09-15",
      "lowest": 12100,
      "lowestDate": "2025-09-28",
      "period": "September"
    }
  }
}
```

---

## Symbol Normalization (Dual-Layer)

Symbol normalization happens at **two levels** to ensure robustness:

```mermaid
flowchart LR
    subgraph Layer1["Layer 1: Agent - System Prompt"]
        U[User says Apple trades] --> A[Agent converts to AAPL]
    end

    subgraph Layer2["Layer 2: Webhook - Code"]
        A --> W[Webhook receives symbol]
        W --> N[normalizeSymbol function]
        N --> D[(Database Query)]
    end

    style Layer1 fill:#1a3a1a
    style Layer2 fill:#1a1a3a
```

### Layer 1: Agent-Level (System Prompt)
The ElevenLabs agent is instructed to convert company names before calling tools:
```
Apple → AAPL, Google/Alphabet → GOOGL, Tesla → TSLA, etc.
```

### Layer 2: Webhook-Level (Code Fallback)
If the agent passes a company name, the webhook handles it as a fallback:

```typescript
const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL',
  'google': 'GOOGL',
  'alphabet': 'GOOGL',
  'amazon': 'AMZN',
  'microsoft': 'MSFT',
  'tesla': 'TSLA',
  'nvidia': 'NVDA',
  'meta': 'META',
  'facebook': 'META',
  'netflix': 'NFLX',
  'amd': 'AMD',
  'intel': 'INTC',
  'bank of america': 'BAC',
  'citigroup': 'C',
  'gamestop': 'GME',
  'lucid': 'LCID',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}
```

This dual-layer approach ensures:
1. **Best case**: Agent sends ticker symbol directly (fastest)
2. **Fallback**: Webhook normalizes company name (robust)

---

## LLM-Based Intent Detection

User queries are classified using **Azure OpenAI GPT-5.2** for accurate intent detection and entity extraction, replacing brittle regex-based pattern matching.

### Architecture

```mermaid
flowchart LR
    subgraph Input["User Input"]
        Q["Show my Apple trades"]
    end

    subgraph LLM["Azure OpenAI GPT-5.2"]
        CLS["/api/classify-intent"]
    end

    subgraph Output["Classification Result"]
        R["intent: trades.detailed<br/>confidence: 0.95<br/>entities: {symbol: AAPL}"]
    end

    subgraph UI["UI Rendering"]
        CARD["TradesTable Card"]
    end

    Q --> CLS --> R --> CARD
```

### Intent Categories

| Domain | Intents | Example Queries |
|--------|---------|-----------------|
| **Trades** | `trades.profitable`, `trades.detailed`, `trades.time_based`, `trades.stats`, `trades.summary` | "Show profitable trades on Tesla", "What did I trade yesterday?" |
| **Options** | `options.bulk`, `options.last_trade`, `options.expiring`, `options.highest_strike`, `options.total_premium` | "Show all short calls", "What options expire this week?" |
| **Account** | `account.summary` | "What's my buying power?", "Show account balance" |
| **Fees** | `fees.query` | "How much commission did I pay?" |

### Entity Extraction

The LLM extracts structured entities from natural language:

| Entity | Examples | Extracted Value |
|--------|----------|-----------------|
| `symbol` | "Apple", "AAPL", "Tesla" | `AAPL`, `TSLA` |
| `timePeriod` | "yesterday", "last week", "this month" | `yesterday`, `last week` |
| `tradeType` | "bought", "sold", "purchases" | `buy`, `sell` |
| `callPut` | "calls", "put options" | `call`, `put` |

### Configuration

Uses direct `fetch()` to Azure OpenAI REST API:

```typescript
// Endpoint format
POST https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-10-21

// Headers
api-key: <your-azure-openai-key>
Content-Type: application/json
```

**Environment Variables:**
```env
AZURE_EXISTING_AIPROJECT_ENDPOINT=https://<resource>.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_MODEL=gpt-5.2
```

**Note:** The classifier reads `.env.local` directly to bypass any conflicting shell environment variables. This is important when the shell has different Azure credentials (e.g., for other AI tools).

---

## Project Structure

```
finagent-frontend/
├── app/
│   ├── api/
│   │   ├── classify-intent/          # LLM intent classification endpoint
│   │   ├── elevenlabs/
│   │   │   ├── profitable-trades/    # Profitable trades webhook
│   │   │   ├── time-trades/          # Time-based trades webhook
│   │   │   ├── trade-stats/          # Trade statistics webhook
│   │   │   ├── advanced-query/       # Advanced options query webhook
│   │   │   ├── tools/                # Multi-tool webhook endpoint
│   │   │   ├── trade-summary/        # Trade summary endpoint
│   │   │   └── detailed-trades/      # Detailed trades endpoint
│   │   ├── profitable-trades-ui/     # UI data for profitable trades card
│   │   ├── time-trades-ui/           # UI data for time-based trades card
│   │   ├── advanced-query-ui/        # UI data for advanced options queries
│   │   ├── trade-stats/              # Trade statistics UI data
│   │   ├── trades-ui/                # Trades table UI data
│   │   ├── average-price/            # Average price UI data
│   │   ├── conversations/            # Conversation CRUD
│   │   └── messages/                 # Message CRUD
│   ├── layout.tsx
│   └── page.tsx
├── src/
│   ├── lib/
│   │   ├── intent-detection/         # LLM-based intent classification
│   │   │   ├── classifier.ts         # Azure OpenAI API calls
│   │   │   ├── prompt.ts             # GPT system prompt builder
│   │   │   ├── types.ts              # TypeScript interfaces
│   │   │   └── intents/registry.ts   # Intent definitions
│   │   ├── date-utils.ts             # Date offset utilities for demo data
│   │   └── date-parser.ts            # Natural language date parsing
│   └── components/
│       ├── UnifiedAssistant.tsx      # Main chat/voice interface
│       ├── QueryBuilder.tsx          # Manual query builder modal
│       └── generative-ui/
│           ├── AccountSummary.tsx        # Account balance/equity card (tabular layout)
│           ├── AdvancedOptionsTable.tsx  # Bulk options trades table
│           ├── AveragePrice.tsx          # Focused average price card
│           ├── ExpiringOptionsTable.tsx  # Options expiring soon table
│           ├── FeesSummary.tsx           # Fees and commissions card
│           ├── HighestStrikeCard.tsx     # Highest/lowest strike card
│           ├── LastOptionTradeCard.tsx   # Most recent option trade card
│           ├── ProfitableTrades.tsx      # Profitable trades card
│           ├── TimeBasedTrades.tsx       # Time-based trades card
│           ├── TimePeriodStats.tsx       # Time-period price stats card
│           ├── TotalPremiumCard.tsx      # Total premium aggregation card
│           ├── TradeQueryCard.tsx        # Query filter display card
│           ├── TradeStats.tsx            # Trade statistics card (full year)
│           ├── TradesTable.tsx           # Full trades table
│           └── TradeSummary.tsx          # Quick summary card
├── tool-config.json                  # ElevenLabs tool configuration
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase account with trade data
- ElevenLabs account with agent configured

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Azure OpenAI (LLM intent classifier)
# Endpoint can be either the resource root (recommended) or the OpenAI-compatible base URL.
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=your_azure_openai_api_key
# This should be your Azure deployment name (not the underlying model name).
AZURE_OPENAI_MODEL=your_deployment_name

# ElevenLabs
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_3101kbjqgdc0fkgvt8f1zw2hbvxv
```

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

---

## Deployment

### Production (Vercel)

The application is deployed to Vercel at: `https://finagent-deployed.vercel.app`

**ElevenLabs Webhook URLs (Production):**
| Tool | Production URL |
|------|----------------|
| get_trade_summary | `https://finagent-deployed.vercel.app/api/elevenlabs/trade-summary` |
| get_detailed_trades | `https://finagent-deployed.vercel.app/api/elevenlabs/detailed-trades` |
| get_trade_stats | `https://finagent-deployed.vercel.app/api/elevenlabs/trade-stats` |
| get_profitable_trades | `https://finagent-deployed.vercel.app/api/elevenlabs/profitable-trades` |
| get_time_based_trades | `https://finagent-deployed.vercel.app/api/elevenlabs/time-trades` |
| advanced_query | `https://finagent-deployed.vercel.app/api/elevenlabs/advanced-query` |

### Local Development

For local development, test API endpoints directly without the ElevenLabs agent:

```bash
# Start dev server
npm run dev

# Test an endpoint with curl
curl -X POST http://localhost:3000/api/elevenlabs/detailed-trades \
  -H "Content-Type: application/json" \
  -d '{"symbol": "TSLA"}'
```

**Note:** ElevenLabs webhook tools are configured with production Vercel URLs. The full voice agent flow uses production webhooks. For local API testing, use curl/Postman to test endpoints directly.

---

## Example Queries

| Query | Tool Used | UI Component |
|-------|-----------|--------------|
| "Show my profitable trades on Google" | get_profitable_trades | ProfitableTrades |
| "What's my most profitable Apple trade?" | get_profitable_trades | ProfitableTrades |
| "What's the highest price I sold NVDA at?" | get_trade_stats | TradeStats |
| "What was the average price I bought Apple for last month?" | get_trade_stats | AveragePrice |
| "Average price I bought Apple at last month" (with highest/lowest) | get_trade_stats | TimePeriodStats |
| "Highest price I paid for GOOGL last week" | get_trade_stats | TimePeriodStats |
| "How many AAPL trades do I have?" | get_trade_summary | TradeSummary |
| "Show me all my Tesla trades" | get_detailed_trades | TradesTable |
| "Show my trades from last week" | get_time_based_trades | TimeBasedTrades |
| "What trades did I make yesterday?" | get_time_based_trades | TimeBasedTrades |
| "GOOGL trades on November 18th" | get_time_based_trades | TimeBasedTrades |
| "Show trades for the past 5 days" | get_time_based_trades | TimeBasedTrades |
| "Show all short call options on Tesla last month" | advanced_query | AdvancedOptionsTable |
| "What's my highest strike put option?" | advanced_query | HighestStrikeCard |
| "How much premium did I collect selling calls?" | advanced_query | TotalPremiumCard |
| "What options are expiring this week?" | advanced_query | ExpiringOptionsTable |
| "What was my last call option trade?" | advanced_query | LastOptionTradeCard |
| "Show all long puts on Apple" | advanced_query | AdvancedOptionsTable |
| "What's my cash balance?" | get_account_balance | AccountSummary |
| "Show my account summary" | get_account_balance | AccountSummary |
| "What's my buying power?" | get_account_balance | AccountSummary |
| "What are my margin requirements?" | get_account_balance | AccountSummary |
| "How much commission did I pay last month?" | get_fees | FeesSummary |
| "Show my interest charges" | get_fees | FeesSummary |
| "What was my short interest for October?" | get_fees | FeesSummary |
| "Short interest for MTEN this year" | get_fees | FeesSummary |
| "How much did I pay to borrow MTEN stock?" | get_fees | FeesSummary |

---

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript |
| **Styling** | Inline React styles (Terminal Luxe dark theme) |
| **Backend** | Next.js API Routes |
| **Database** | Supabase PostgreSQL |
| **Voice AI** | ElevenLabs Conversational AI |
| **LLM Intent Detection** | Azure OpenAI GPT-5.2 |
| **State** | React useState/useRef |

---

## License

Private - All rights reserved

---

Built with ElevenLabs Conversational AI and Supabase
