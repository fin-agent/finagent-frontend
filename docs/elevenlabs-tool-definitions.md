# ElevenLabs Tool Definitions

Copy these tool parameter definitions into the ElevenLabs dashboard for each tool.

## date_filter Parameter (Add to ALL tools with time periods)

Add this parameter to: `get_time_based_trades`, `get_trade_stats`, `get_fees`, `get_options`, `get_account_balance`, `get_profitable_trades`

```json
{
  "name": "date_filter",
  "type": "object",
  "required": false,
  "description": "Resolved date range. YOU must convert the user's time expression to explicit YYYY-MM-DD dates before calling this tool.",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["range", "discrete"],
      "description": "range = continuous date range (start to end), discrete = specific non-contiguous dates"
    },
    "startDate": {
      "type": "string",
      "description": "Start date in YYYY-MM-DD format. Required for range type."
    },
    "endDate": {
      "type": "string",
      "description": "End date in YYYY-MM-DD format. Required for range type."
    },
    "dates": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Array of specific dates in YYYY-MM-DD format. Required for discrete type."
    },
    "description": {
      "type": "string",
      "description": "Human-readable description like 'last week', 'September', 'Q3 2025'. Used in voice responses."
    }
  }
}
```

---

## Tool: get_time_based_trades

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| time_period | string | No | Raw time period string (legacy, prefer date_filter) |
| date_filter | object | Yes | Resolved dates - see structure above |
| symbol | string | No | Stock ticker (e.g., "AAPL", "TSLA") |
| trade_type | string | No | "buy" or "sell" |
| calculation | string | No | "average" for average price calculations |

---

## Tool: get_trade_stats

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| symbol | string | Yes | Stock ticker (e.g., "AAPL", "GOOGL") |
| trade_type | string | No | "buy" or "sell" |
| time_period | string | No | Raw time period string (legacy) |
| date_filter | object | Yes | Resolved dates - see structure above |

---

## Tool: get_fees

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| fee_type | string | Yes | One of: "commission", "credit_interest", "debit_interest", "locate_fee", "short_interest" |
| time_period | string | No | Raw time period string (legacy) |
| date_filter | object | Yes | Resolved dates - see structure above |
| symbol | string | No | Stock ticker for locate_fee/short_interest queries |

---

## Tool: get_options

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query_type | string | Yes | One of: "bulk", "last", "expiring", "highest_strike", "total_premium" |
| symbol | string | No | Stock ticker (e.g., "TSLA", "AAPL") |
| trade_type | string | No | "buy" or "sell" |
| call_put | string | No | "call" or "put" |
| time_period | string | No | Raw time period string (legacy) |
| date_filter | object | Yes | Resolved dates for trade date filtering |
| expiration | string | No | Raw expiration string (legacy) |
| expiration_date_filter | object | No | Resolved dates for expiration filtering (same structure as date_filter) |

---

## Tool: get_account_balance

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| query_type | string | Yes | One of: "cash_balance", "cash_and_equity", "buying_power", "account_summary", "nlv", "overnight_margin", "market_value", "debit_balances", "credit_balances" |
| time_period | string | No | Raw time period string (legacy, for debit/credit balances) |
| date_filter | object | No | Resolved dates for debit_balances/credit_balances queries |

---

## Tool: get_profitable_trades

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| symbol | string | Yes | Stock ticker (e.g., "AAPL", "GOOGL") |
| time_period | string | No | Raw time period string (legacy) |
| date_filter | object | No | Resolved dates to filter profitable trades |

---

## Example Tool Calls

### Example 1: "Show my trades from last week"

```json
{
  "tool": "get_time_based_trades",
  "parameters": {
    "date_filter": {
      "type": "range",
      "startDate": "2025-12-15",
      "endDate": "2025-12-21",
      "description": "last week"
    }
  }
}
```

### Example 2: "Commissions for Q3"

```json
{
  "tool": "get_fees",
  "parameters": {
    "fee_type": "commission",
    "date_filter": {
      "type": "range",
      "startDate": "2025-07-01",
      "endDate": "2025-09-30",
      "description": "Q3 2025"
    }
  }
}
```

### Example 3: "Highest price I sold Apple this year"

```json
{
  "tool": "get_trade_stats",
  "parameters": {
    "symbol": "AAPL",
    "trade_type": "sell",
    "date_filter": {
      "type": "range",
      "startDate": "2025-01-01",
      "endDate": "2025-12-27",
      "description": "this year"
    }
  }
}
```

### Example 4: "Debit balances for last 6 months"

```json
{
  "tool": "get_account_balance",
  "parameters": {
    "query_type": "debit_balances",
    "date_filter": {
      "type": "range",
      "startDate": "2025-06-27",
      "endDate": "2025-12-27",
      "description": "last 6 months"
    }
  }
}
```

### Example 5: "Short calls on Tesla last quarter"

```json
{
  "tool": "get_options",
  "parameters": {
    "query_type": "bulk",
    "symbol": "TSLA",
    "trade_type": "sell",
    "call_put": "call",
    "date_filter": {
      "type": "range",
      "startDate": "2025-10-01",
      "endDate": "2025-12-31",
      "description": "last quarter"
    }
  }
}
```

### Example 6: "Trades on July 1st and August 1st" (discrete dates)

```json
{
  "tool": "get_time_based_trades",
  "parameters": {
    "date_filter": {
      "type": "discrete",
      "dates": ["2025-07-01", "2025-08-01"],
      "description": "July 1st and August 1st"
    }
  }
}
```

---

## Quarter Reference

| Quarter | Start Date | End Date |
|---------|------------|----------|
| Q1 | YYYY-01-01 | YYYY-03-31 |
| Q2 | YYYY-04-01 | YYYY-06-30 |
| Q3 | YYYY-07-01 | YYYY-09-30 |
| Q4 | YYYY-10-01 | YYYY-12-31 |

## Month Days Reference

| Month | Days |
|-------|------|
| January, March, May, July, August, October, December | 31 |
| April, June, September, November | 30 |
| February | 28 (29 in leap years) |
