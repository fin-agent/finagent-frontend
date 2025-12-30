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
 *
 * When filters are applied (tradeType, instrument), generates context-aware natural responses:
 * - "buy stock trades in Apple" → "You bought 180 shares of Apple in 4 trades"
 * - "sell option trades" → "You sold 3 option contracts"
 */
export function buildVoiceResponse(
  result: TradeQueryResult,
  options?: {
    includeAggregates?: boolean;
    includeBreakdown?: boolean;
    // Filter context for natural responses
    tradeType?: 'buy' | 'sell' | 'all';
    instrument?: 'stock' | 'option' | 'all';
  }
): string {
  const { counts, metadata } = result;
  const {
    includeAggregates = true,
    includeBreakdown = true,
    tradeType = 'all',
    instrument = 'all',
  } = options || {};

  const symbol = metadata.symbol === '(all)' ? '' : metadata.symbol;
  const period = metadata.dateRange.description || '';

  // Zero results case
  if (counts.total === 0) {
    const filterDesc = buildFilterDescription(tradeType, instrument);
    return `No ${filterDesc}trades found${symbol ? ` for ${symbol}` : ''}${period ? ` ${period}` : ''}.`;
  }

  // Check if specific filters were applied for context-aware response
  const hasTradeTypeFilter = tradeType !== 'all';
  const hasInstrumentFilter = instrument !== 'all';

  // If both filters applied, generate a natural context-aware response
  if (hasTradeTypeFilter && hasInstrumentFilter) {
    return buildFilteredResponse(result, tradeType, instrument, symbol, period);
  }

  // If only trade type filter, generate semi-filtered response
  if (hasTradeTypeFilter) {
    return buildTradeTypeFilteredResponse(result, tradeType, symbol, period, includeBreakdown);
  }

  // If only instrument filter, generate instrument-filtered response
  if (hasInstrumentFilter) {
    return buildInstrumentFilteredResponse(result, instrument, symbol, period, includeBreakdown);
  }

  // Default: no filters - use standard response format
  return buildStandardResponse(result, symbol, period, includeBreakdown, includeAggregates);
}

/**
 * Build description of applied filters for zero-results message
 */
function buildFilterDescription(tradeType: string, instrument: string): string {
  const parts: string[] = [];
  if (tradeType === 'buy') parts.push('buy');
  if (tradeType === 'sell') parts.push('sell');
  if (instrument === 'stock') parts.push('stock');
  if (instrument === 'option') parts.push('option');
  return parts.length > 0 ? parts.join(' ') + ' ' : '';
}

/**
 * Build natural response when both tradeType and instrument filters are applied.
 * E.g., "You bought 180 shares of Apple across 4 trades in November"
 */
function buildFilteredResponse(
  result: TradeQueryResult,
  tradeType: 'buy' | 'sell',
  instrument: 'stock' | 'option',
  symbol: string,
  period: string
): string {
  const { counts, aggregates } = result;
  const action = tradeType === 'buy' ? 'bought' : 'sold';

  if (instrument === 'stock') {
    const shares = Math.round(aggregates.totalShares);
    const symbolPart = symbol ? ` of ${symbol}` : '';
    const periodPart = period ? ` in ${period}` : '';
    const tradesPart = counts.total > 1 ? ` across ${counts.total} trades` : '';
    return `You ${action} ${shares} shares${symbolPart}${tradesPart}${periodPart}.`;
  } else {
    // Options
    const contracts = Math.round(aggregates.totalContracts);
    const symbolPart = symbol ? ` on ${symbol}` : '';
    const periodPart = period ? ` in ${period}` : '';
    const tradesPart = counts.total > 1 ? ` across ${counts.total} trades` : '';
    return `You ${action} ${contracts} option contracts${symbolPart}${tradesPart}${periodPart}.`;
  }
}

/**
 * Build response when only tradeType filter is applied.
 * E.g., "You made 5 buy trades for Apple in November"
 */
function buildTradeTypeFilteredResponse(
  result: TradeQueryResult,
  tradeType: 'buy' | 'sell',
  symbol: string,
  period: string,
  includeBreakdown: boolean
): string {
  const { counts } = result;
  const action = tradeType === 'buy' ? 'buy' : 'sell';
  const symbolPart = symbol ? ` for ${symbol}` : '';
  const periodPart = period ? ` in ${period}` : '';

  let response = `You made ${counts.total} ${action} trades${symbolPart}${periodPart}`;

  // Add breakdown if requested and we have mixed stock/option
  if (includeBreakdown && counts.stocks > 0 && counts.options > 0) {
    response += `. ${counts.stocks} stock trades and ${counts.options} option trades`;
  }

  return response + '.';
}

/**
 * Build response when only instrument filter is applied.
 * E.g., "Found 4 stock trades for Apple in November"
 */
function buildInstrumentFilteredResponse(
  result: TradeQueryResult,
  instrument: 'stock' | 'option',
  symbol: string,
  period: string,
  includeBreakdown: boolean
): string {
  const { counts, aggregates } = result;
  const instrumentName = instrument === 'stock' ? 'stock' : 'option';
  const symbolPart = symbol ? ` for ${symbol}` : '';
  const periodPart = period ? ` ${period}` : '';

  let response = `Found ${counts.total} ${instrumentName} trades${symbolPart}${periodPart}`;

  // Add buy/sell breakdown if requested
  if (includeBreakdown && counts.buys > 0 && counts.sells > 0) {
    response += `. ${counts.buys} buys and ${counts.sells} sells`;
  }

  // Add quantity info
  if (instrument === 'stock' && aggregates.totalShares > 0) {
    response += `. Total: ${Math.round(aggregates.totalShares)} shares`;
  } else if (instrument === 'option' && aggregates.totalContracts > 0) {
    response += `. Total: ${Math.round(aggregates.totalContracts)} contracts`;
  }

  return response + '.';
}

/**
 * Build standard response when no filters are applied.
 */
function buildStandardResponse(
  result: TradeQueryResult,
  symbol: string,
  period: string,
  includeBreakdown: boolean,
  includeAggregates: boolean
): string {
  const { counts, aggregates } = result;
  const symbolPart = symbol ? ` for ${symbol}` : '';
  const periodPart = period ? ` ${period}` : '';

  const parts: string[] = [];

  // Main count
  parts.push(`Found ${counts.total} trades${symbolPart}${periodPart}`);

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
