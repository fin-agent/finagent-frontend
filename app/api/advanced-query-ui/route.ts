import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { parseTimePeriodToResolvedDates, type ResolvedDates } from '@/src/lib/date-parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface AdvancedQueryFilters {
  symbol?: string;
  securityType?: 'S' | 'O' | 'all';
  tradeType?: 'B' | 'S' | 'all';
  callPut?: 'C' | 'P' | 'all';
  fromDate?: string;
  toDate?: string;
  fromTime?: string;
  toTime?: string;
  expiration?: string;
  strike?: number;
  limit?: number;
  orderBy?: 'date' | 'strike' | 'premium';
  orderDir?: 'asc' | 'desc';
}

export interface AdvancedQueryResult {
  trades: Array<{
    TradeID: number;
    Date: string;
    Symbol: string;
    SecurityType: string;
    TradeType: string;
    StockTradePrice: string;
    StockShareQty: string;
    OptionContracts: string;
    OptionTradePremium: string;
    GrossAmount: string;
    NetAmount: string;
    Strike?: string;
    Expiration?: string;
    'Call/Put'?: string;
  }>;
  aggregations: {
    tradeCount: number;
    totalTrades: number;
    totalPremium: number;        // Gross premium (premium * contracts * 100 for options)
    totalNetAmount: number;      // Net amount after fees
    avgPremium: number;          // Average premium per share (for options)
    totalQuantity: number;
    totalContracts: number;      // Total option contracts
    totalShares: number;         // Total stock shares
    sharesCovered: number;       // For options: contracts * 100
    buyCount: number;
    sellCount: number;
    stockCount: number;
    optionCount: number;
    callCount: number;
    putCount: number;
  };
  filters: AdvancedQueryFilters;
}

export async function POST(req: NextRequest) {
  try {
    const filters: AdvancedQueryFilters = await req.json();
    console.log('Advanced query UI request:', JSON.stringify(filters, null, 2));

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    // Apply symbol filter
    if (filters.symbol) {
      const normalizedSymbol = normalizeSymbol(filters.symbol);
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    // Apply security type filter
    if (filters.securityType && filters.securityType !== 'all') {
      query = query.eq('SecurityType', filters.securityType);
    }

    // Apply trade type filter
    if (filters.tradeType && filters.tradeType !== 'all') {
      query = query.eq('TradeType', filters.tradeType);
    }

    // Apply call/put filter - use filter with quoted column name for special characters
    if (filters.callPut && filters.callPut !== 'all') {
      query = query.filter('"Call/Put"', 'eq', filters.callPut);
    }

    // Apply date range filters using centralized parser
    // Supports discrete dates (e.g., "July 1st and August 1st") and ranges (e.g., "June 1st to the 7th")
    let resolvedFromDate: ResolvedDates | null = null;
    if (filters.fromDate) {
      resolvedFromDate = parseTimePeriodToResolvedDates(filters.fromDate);
      if (resolvedFromDate) {
        if (resolvedFromDate.type === 'discrete' && resolvedFromDate.dates && resolvedFromDate.dates.length > 0) {
          // For discrete dates, use IN query
          query = query.in('Date', resolvedFromDate.dates);
        } else if (resolvedFromDate.startDate) {
          query = query.gte('Date', resolvedFromDate.startDate);
          // Also apply end date if the time period has one (e.g., "last month" = Oct 1-31)
          // Only apply if toDate wasn't explicitly provided
          if (resolvedFromDate.endDate && !filters.toDate) {
            query = query.lte('Date', resolvedFromDate.endDate);
          }
        }
      }
    }

    if (filters.toDate) {
      const resolvedToDate = parseTimePeriodToResolvedDates(filters.toDate);
      if (resolvedToDate && resolvedToDate.endDate) {
        query = query.lte('Date', resolvedToDate.endDate);
      }
    }

    // Apply expiration filter using centralized parser
    if (filters.expiration) {
      const resolvedExp = parseTimePeriodToResolvedDates(filters.expiration);
      if (resolvedExp) {
        if (resolvedExp.type === 'discrete' && resolvedExp.dates && resolvedExp.dates.length > 0) {
          query = query.in('Expiration', resolvedExp.dates);
        } else if (resolvedExp.startDate === resolvedExp.endDate && resolvedExp.startDate) {
          query = query.eq('Expiration', resolvedExp.startDate);
        } else if (resolvedExp.startDate) {
          query = query.gte('Expiration', resolvedExp.startDate);
          if (resolvedExp.endDate) {
            query = query.lte('Expiration', resolvedExp.endDate);
          }
        }
      }
    }

    // Apply strike filter
    if (filters.strike !== undefined && filters.strike !== null) {
      query = query.eq('Strike', filters.strike);
    }

    // Apply ordering
    const orderColumn = filters.orderBy === 'strike' ? 'Strike' :
                        filters.orderBy === 'premium' ? 'OptionTradePremium' : 'Date';
    const ascending = filters.orderDir === 'asc';
    query = query.order(orderColumn, { ascending });

    // Apply limit
    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const trades = data || [];

    // Calculate aggregations with correct option math
    // For options: 1 contract = 100 shares, premium is per-share price
    // Total premium = premium_per_share * contracts * 100

    // Sum contracts (for options) and shares (for stocks) separately
    const totalContracts = trades.reduce((sum, t) => {
      return sum + (t.SecurityType === 'O' ? parseFloat(t.OptionContracts || '0') : 0);
    }, 0);
    const totalShares = trades.reduce((sum, t) => {
      return sum + (t.SecurityType === 'S' ? parseFloat(t.StockShareQty || '0') : 0);
    }, 0);

    // For options: shares covered = contracts * 100
    const sharesCovered = totalContracts * 100;

    // Net amount (what was actually received/paid after fees)
    // Use NetAmount for all premium calculations to match ElevenLabs voice API exactly
    const totalNetAmount = trades.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Average premium per share (for options only)
    // Uses NetAmount / totalContracts / 100 to match voice API calculation exactly
    // This ensures voice says "$5.35" and UI shows "$5.35" - no rounding discrepancies
    const avgPremiumPerShare = totalContracts > 0
      ? totalNetAmount / totalContracts / 100
      : 0;

    const aggregations = {
      tradeCount: trades.length,
      totalTrades: trades.length,
      totalPremium: totalNetAmount,           // Net amount after fees (matches ElevenLabs response)
      totalNetAmount,                         // Net amount after fees
      avgPremium: avgPremiumPerShare,          // Average premium per share
      totalQuantity: trades.reduce((sum, t) => {
        const qty = t.SecurityType === 'O'
          ? parseFloat(t.OptionContracts || '0')
          : parseFloat(t.StockShareQty || '0');
        return sum + qty;
      }, 0),
      totalContracts,
      totalShares,
      sharesCovered,                          // contracts * 100 for options
      buyCount: trades.filter(t => t.TradeType === 'B').length,
      sellCount: trades.filter(t => t.TradeType === 'S').length,
      stockCount: trades.filter(t => t.SecurityType === 'S').length,
      optionCount: trades.filter(t => t.SecurityType === 'O').length,
      callCount: trades.filter(t => t['Call/Put'] === 'C').length,
      putCount: trades.filter(t => t['Call/Put'] === 'P').length,
    };

    // Resolve date ranges for display using centralized parser
    // Note: resolvedFromDate was already parsed above for query building
    const toDateParsed = filters.toDate ? parseTimePeriodToResolvedDates(filters.toDate) : null;

    const result: AdvancedQueryResult = {
      trades,
      aggregations,
      filters: {
        ...filters,
        symbol: filters.symbol ? normalizeSymbol(filters.symbol) : undefined,
        // Return resolved dates for display
        // For discrete dates, use first date; for ranges, use startDate
        fromDate: resolvedFromDate?.type === 'discrete' && resolvedFromDate.dates?.length
          ? resolvedFromDate.dates[0]
          : resolvedFromDate?.startDate || filters.fromDate,
        toDate: toDateParsed?.endDate || resolvedFromDate?.endDate ||
          (resolvedFromDate?.type === 'discrete' && resolvedFromDate.dates?.length
            ? resolvedFromDate.dates[resolvedFromDate.dates.length - 1]
            : filters.toDate),
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Advanced query UI error:', error);
    return NextResponse.json({ error: 'Failed to execute query' }, { status: 500 });
  }
}
