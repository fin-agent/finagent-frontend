/**
 * Unified Trade Query
 *
 * Single source of truth for querying trades from the database.
 * Used by both voice webhooks and UI endpoints to ensure voice/UI data consistency.
 *
 * This eliminates the scattered query logic throughout webhooks that can lead to drift.
 */

import { createClient } from '@supabase/supabase-js';
import { resolveQuery, DateFilter, createTraceId, formatResolvedQueryForLog } from './query-resolver';
import { formatCalendarDate } from './date-utils';
import { parseOptionSymbol } from './symbol-utils';

// =============================================================================
// Types
// =============================================================================

// Raw trade row from database
export interface TradeRow {
  TradeID: number;
  Date: string;
  Symbol: string;
  UnderlyingSymbol?: string;
  SecurityType: string;  // 'S' = Stock, 'O' = Option
  TradeType: string;     // 'B' = Buy, 'S' = Sell
  StockShareQty?: string;
  StockTradePrice?: string;
  OptionContracts?: string;
  OptionTradePremium?: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
  GrossAmount?: string;
  NetAmount?: string;
  AccountCode: string;
}

// Computed counts from query results
export interface TradeCounts {
  total: number;
  stocks: number;
  options: number;
  buys: number;
  sells: number;
}

// Aggregate values computed from rows
export interface TradeAggregates {
  totalShares: number;
  totalContracts: number;
  totalQuantity: number;
  totalValue: number;
  avgValue: number;
}

// Query metadata for debugging
export interface QueryMetadata {
  traceId: string;
  symbol: string;
  dateRange: {
    start: string;
    end: string;
    description: string;
  };
  queryTimestamp: string;
  rowCount: number;
}

// Main result structure
export interface TradeQueryResult {
  rows: TradeRow[];
  counts: TradeCounts;
  aggregates: TradeAggregates;
  metadata: QueryMetadata;
  // For UI components
  formattedTrades: FormattedTrade[];
}

// Formatted trade for UI display
export interface FormattedTrade {
  Date: string;
  Symbol: string;
  TradeType: string;
  SecurityType: string;
  StockShareQty?: string;
  OptionContracts?: string;
  StockTradePrice?: string;
  OptionTradePremium?: string;
  NetAmount?: string;
  Strike?: string;
  Expiration?: string;
  'Call/Put'?: string;
}

// Input parameters for query
export interface TradeQueryInput {
  symbol?: string;
  timePeriod?: string;
  dateFilter?: DateFilter;
  tradeType?: 'buy' | 'sell' | 'all';
  instrument?: 'stock' | 'option' | 'all';
  // Maximum trades to return (default: 1000)
  limit?: number;
}

// =============================================================================
// Constants
// =============================================================================

const ACCOUNT_CODE = 'C40421';

// =============================================================================
// Query Function
// =============================================================================

/**
 * Query trades from database with unified resolution and computation.
 *
 * This is the SINGLE SOURCE OF TRUTH for trade queries.
 * Both voice webhooks and UI endpoints should use this function.
 *
 * @example
 * ```typescript
 * const result = await queryTrades({
 *   symbol: 'Apple',
 *   timePeriod: 'January',
 *   tradeType: 'buy',
 * });
 *
 * // Voice response uses computed counts
 * console.log(`Found ${result.counts.total} trades`);
 *
 * // UI uses the same data
 * renderTradesTable(result.formattedTrades);
 * ```
 */
export async function queryTrades(input: TradeQueryInput): Promise<TradeQueryResult> {
  const traceId = createTraceId();
  const queryTimestamp = new Date().toISOString();

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Resolve query parameters using unified resolver
  const resolved = await resolveQuery({
    symbol: input.symbol,
    timePeriod: input.timePeriod,
    dateFilter: input.dateFilter,
    tradeType: input.tradeType || 'all',
    instrument: input.instrument || 'all',
  });

  console.log(`🔍 [TradeQuery ${traceId}] ${formatResolvedQueryForLog(resolved)}`);

  // Build base query
  let query = supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE);

  // Apply symbol filter if provided
  if (resolved.symbol) {
    query = query.or(`Symbol.eq.${resolved.symbol},UnderlyingSymbol.eq.${resolved.symbol}`);
  }

  // Apply date range filter
  const { start, end } = resolved.dateRange;
  if (start && end) {
    query = query.gte('Date', start).lte('Date', end);
    console.log(`🔍 [TradeQuery ${traceId}] Date filter: ${start} to ${end}`);
  }

  // Apply trade type filter
  if (resolved.tradeType === 'buy') {
    query = query.eq('TradeType', 'B');
  } else if (resolved.tradeType === 'sell') {
    query = query.eq('TradeType', 'S');
  }

  // Apply instrument filter
  if (resolved.instrument === 'stock') {
    query = query.eq('SecurityType', 'S');
  } else if (resolved.instrument === 'option') {
    query = query.eq('SecurityType', 'O');
  }

  // Order by date descending (most recent first)
  query = query.order('Date', { ascending: false });

  // Apply limit if specified
  const limit = input.limit || 1000;
  query = query.limit(limit);

  // Execute query
  const { data, error } = await query;

  if (error) {
    console.error(`❌ [TradeQuery ${traceId}] Database error:`, error.message);
    throw new Error(`Database query failed: ${error.message}`);
  }

  const rows = (data || []) as TradeRow[];
  console.log(`✅ [TradeQuery ${traceId}] Found ${rows.length} trades`);

  // Compute counts
  const counts = computeCounts(rows);

  // Compute aggregates
  const aggregates = computeAggregates(rows);

  // Format trades for UI
  const formattedTrades = formatTrades(rows);

  // Build metadata
  const metadata: QueryMetadata = {
    traceId,
    symbol: resolved.symbol || '(all)',
    dateRange: resolved.dateRange,
    queryTimestamp,
    rowCount: rows.length,
  };

  return {
    rows,
    counts,
    aggregates,
    metadata,
    formattedTrades,
  };
}

// =============================================================================
// Computation Functions
// =============================================================================

/**
 * Compute trade counts from rows.
 */
function computeCounts(rows: TradeRow[]): TradeCounts {
  const stocks = rows.filter(r => r.SecurityType === 'S').length;
  const options = rows.filter(r => r.SecurityType === 'O').length;
  const buys = rows.filter(r => r.TradeType === 'B').length;
  const sells = rows.filter(r => r.TradeType === 'S').length;

  return {
    total: rows.length,
    stocks,
    options,
    buys,
    sells,
  };
}

/**
 * Compute aggregate values from rows.
 */
function computeAggregates(rows: TradeRow[]): TradeAggregates {
  const stockRows = rows.filter(r => r.SecurityType === 'S');
  const optionRows = rows.filter(r => r.SecurityType === 'O');

  const totalShares = stockRows.reduce(
    (sum, r) => sum + parseFloat(r.StockShareQty || '0'),
    0
  );

  const totalContracts = optionRows.reduce(
    (sum, r) => sum + parseFloat(r.OptionContracts || '0'),
    0
  );

  const totalQuantity = totalShares + totalContracts;

  // Total value is sum of absolute NetAmounts
  const totalValue = rows.reduce(
    (sum, r) => sum + Math.abs(parseFloat(r.NetAmount || '0')),
    0
  );

  const avgValue = rows.length > 0 ? totalValue / rows.length : 0;

  return {
    totalShares: Math.round(totalShares * 100) / 100,
    totalContracts: Math.round(totalContracts * 100) / 100,
    totalQuantity: Math.round(totalQuantity * 100) / 100,
    totalValue: Math.round(totalValue * 100) / 100,
    avgValue: Math.round(avgValue * 100) / 100,
  };
}

/**
 * Format trades for UI display.
 */
function formatTrades(rows: TradeRow[]): FormattedTrade[] {
  return rows.map(row => ({
    Date: formatCalendarDate(row.Date),
    Symbol: parseOptionSymbol(row.Symbol),
    TradeType: row.TradeType,
    SecurityType: row.SecurityType,
    StockShareQty: row.StockShareQty,
    OptionContracts: row.OptionContracts,
    StockTradePrice: row.StockTradePrice,
    OptionTradePremium: row.OptionTradePremium,
    NetAmount: row.NetAmount,
    Strike: row.Strike,
    Expiration: row.Expiration,
    'Call/Put': row['Call/Put'],
  }));
}

// =============================================================================
// Response Builders
// =============================================================================

/**
 * Build a voice response from query results.
 * Uses ONLY computed data - never fabricates numbers.
 */
export function buildVoiceResponse(
  result: TradeQueryResult,
  options?: {
    includeAggregates?: boolean;
    includeBreakdown?: boolean;
  }
): string {
  const { counts, aggregates, metadata } = result;
  const { includeAggregates = true, includeBreakdown = true } = options || {};

  const symbol = metadata.symbol === '(all)' ? '' : ` for ${metadata.symbol}`;
  const period = metadata.dateRange.description
    ? ` ${metadata.dateRange.description}`
    : '';

  // Zero results case
  if (counts.total === 0) {
    return `No trades found${symbol}${period}.`;
  }

  // Build response parts
  const parts: string[] = [];

  // Main count
  parts.push(`Found ${counts.total} trades${symbol}${period}`);

  // Stock/option breakdown
  if (includeBreakdown && (counts.stocks > 0 || counts.options > 0)) {
    parts.push(`${counts.stocks} stock trades and ${counts.options} option trades`);
  }

  // Buy/sell breakdown
  if (includeBreakdown) {
    parts.push(`${counts.buys} buys and ${counts.sells} sells`);
  }

  // Aggregates
  if (includeAggregates && aggregates.totalValue > 0) {
    parts.push(`Total value: $${aggregates.totalValue.toFixed(2)}`);
  }

  return parts.join('. ') + '.';
}

/**
 * Build UI data structure from query results.
 * This is the exact data structure expected by UI components.
 */
export function buildUIData(result: TradeQueryResult): {
  symbol: string;
  tradeCount: number;
  stockCount: number;
  optionCount: number;
  buyCount: number;
  sellCount: number;
  totalShares: number;
  totalContracts: number;
  totalQuantity: number;
  totalValue: number;
  avgValue: number;
  timePeriod?: string;
  trades: FormattedTrade[];
} {
  return {
    symbol: result.metadata.symbol === '(all)' ? '' : result.metadata.symbol,
    tradeCount: result.counts.total,
    stockCount: result.counts.stocks,
    optionCount: result.counts.options,
    buyCount: result.counts.buys,
    sellCount: result.counts.sells,
    totalShares: result.aggregates.totalShares,
    totalContracts: result.aggregates.totalContracts,
    totalQuantity: result.aggregates.totalQuantity,
    totalValue: result.aggregates.totalValue,
    avgValue: result.aggregates.avgValue,
    timePeriod: result.metadata.dateRange.description || undefined,
    trades: result.formattedTrades,
  };
}

// =============================================================================
// Consistency Check
// =============================================================================

/**
 * Validate that a voice response is consistent with UI data.
 * Returns errors array (empty if consistent).
 *
 * Use this as a guard before returning responses to catch drift.
 */
export function validateConsistency(
  voiceResponse: string,
  uiData: ReturnType<typeof buildUIData>
): string[] {
  const errors: string[] = [];

  // Extract numbers from voice response
  const numbersInResponse = voiceResponse.match(/\d+/g)?.map(Number) || [];

  // If UI shows zero trades but voice mentions numbers, that's inconsistent
  if (uiData.tradeCount === 0 && numbersInResponse.some(n => n > 0)) {
    // Check if these are actual trade counts (not just year numbers like 2025)
    const potentialTradeCounts = numbersInResponse.filter(n => n < 1000 && n !== new Date().getFullYear());
    if (potentialTradeCounts.length > 0) {
      errors.push(`Voice mentions numbers ${potentialTradeCounts.join(', ')} but UI shows 0 trades`);
    }
  }

  // Check if stock/option counts in voice match UI
  const stockMatch = voiceResponse.match(/(\d+)\s*stock\s*trades?/i);
  const optionMatch = voiceResponse.match(/(\d+)\s*option\s*trades?/i);

  if (stockMatch && parseInt(stockMatch[1]) !== uiData.stockCount) {
    errors.push(`Voice says ${stockMatch[1]} stock trades but UI shows ${uiData.stockCount}`);
  }

  if (optionMatch && parseInt(optionMatch[1]) !== uiData.optionCount) {
    errors.push(`Voice says ${optionMatch[1]} option trades but UI shows ${uiData.optionCount}`);
  }

  return errors;
}
