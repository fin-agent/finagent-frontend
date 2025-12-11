import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Demo date system - the latest trade date in demo database represents "today"
const DEMO_TODAY = '2025-11-20';

function getDemoToday(): Date {
  const [year, month, day] = DEMO_TODAY.split('-').map(Number);
  return new Date(year, month - 1, day);
}

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
  'spy': 'SPY',
  'qualcomm': 'QCOM',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

// Parse relative dates like "tomorrow", "last month", "this year"
// Uses demo date system so "last month" = October 2025 when DEMO_TODAY is Nov 20, 2025
function parseRelativeDate(input: string): { start?: string; end?: string } {
  // Use demo "today" instead of actual today for demo data alignment
  const demoToday = getDemoToday();
  const today = new Date(demoToday.getFullYear(), demoToday.getMonth(), demoToday.getDate());

  const lower = input.toLowerCase().trim();

  // Helper to format date as YYYY-MM-DD
  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return { start: formatDate(tomorrow), end: formatDate(tomorrow) };
  }

  if (lower === 'today') {
    return { start: formatDate(today), end: formatDate(today) };
  }

  if (lower === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: formatDate(yesterday), end: formatDate(yesterday) };
  }

  if (lower === 'this week') {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    return { start: formatDate(startOfWeek), end: formatDate(today) };
  }

  if (lower === 'last week') {
    const startOfLastWeek = new Date(today);
    startOfLastWeek.setDate(today.getDate() - today.getDay() - 7);
    const endOfLastWeek = new Date(startOfLastWeek);
    endOfLastWeek.setDate(startOfLastWeek.getDate() + 6);
    return { start: formatDate(startOfLastWeek), end: formatDate(endOfLastWeek) };
  }

  if (lower === 'this month') {
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: formatDate(startOfMonth), end: formatDate(today) };
  }

  if (lower === 'last month') {
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { start: formatDate(startOfLastMonth), end: formatDate(endOfLastMonth) };
  }

  if (lower === 'this year' || lower === 'ytd') {
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    return { start: formatDate(startOfYear), end: formatDate(today) };
  }

  if (lower === 'last year') {
    const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
    const endOfLastYear = new Date(today.getFullYear() - 1, 11, 31);
    return { start: formatDate(startOfLastYear), end: formatDate(endOfLastYear) };
  }

  const lastNMonthsMatch = lower.match(/last\s+(\d+)\s+months?/);
  if (lastNMonthsMatch) {
    const months = parseInt(lastNMonthsMatch[1]);
    const startDate = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  const lastNDaysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (lastNDaysMatch) {
    const days = parseInt(lastNDaysMatch[1]);
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    return { start: formatDate(startDate), end: formatDate(today) };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
    const date = new Date(input);
    if (!isNaN(date.getTime())) {
      return { start: formatDate(date), end: formatDate(date) };
    }
  }

  return {};
}

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

    // Apply date range filters
    if (filters.fromDate) {
      const parsed = parseRelativeDate(filters.fromDate);
      if (parsed.start) {
        query = query.gte('Date', parsed.start);
      }
    }

    if (filters.toDate) {
      const parsed = parseRelativeDate(filters.toDate);
      if (parsed.end) {
        query = query.lte('Date', parsed.end);
      }
    }

    // Apply expiration filter
    if (filters.expiration) {
      const parsed = parseRelativeDate(filters.expiration);
      if (parsed.start && parsed.end && parsed.start === parsed.end) {
        query = query.eq('Expiration', parsed.start);
      } else if (parsed.start) {
        query = query.gte('Expiration', parsed.start);
        if (parsed.end) {
          query = query.lte('Expiration', parsed.end);
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

    // Calculate gross premium correctly
    // OptionTradePremium is per-share price, so total = premium * contracts * 100
    const totalGrossPremium = trades.reduce((sum, t) => {
      if (t.SecurityType === 'O') {
        const premium = parseFloat(t.OptionTradePremium || '0');
        const contracts = parseFloat(t.OptionContracts || '0');
        return sum + (premium * contracts * 100);
      }
      return sum + Math.abs(parseFloat(t.GrossAmount || '0'));
    }, 0);

    // Net amount (what was actually received/paid after fees)
    const totalNetAmount = trades.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Average premium per share (for options only)
    // totalGrossPremium / totalContracts / 100 shares per contract
    const avgPremiumPerShare = totalContracts > 0
      ? totalGrossPremium / totalContracts / 100
      : 0;

    const aggregations = {
      tradeCount: trades.length,
      totalTrades: trades.length,
      totalPremium: totalGrossPremium,       // Gross premium (premium * contracts * 100)
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

    // Resolve date ranges for display
    const fromDateParsed = filters.fromDate ? parseRelativeDate(filters.fromDate) : null;
    const toDateParsed = filters.toDate ? parseRelativeDate(filters.toDate) : null;

    const result: AdvancedQueryResult = {
      trades,
      aggregations,
      filters: {
        ...filters,
        symbol: filters.symbol ? normalizeSymbol(filters.symbol) : undefined,
        // Return resolved dates for display
        fromDate: fromDateParsed?.start || filters.fromDate,
        toDate: toDateParsed?.end || fromDateParsed?.end || filters.toDate,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Advanced query UI error:', error);
    return NextResponse.json({ error: 'Failed to execute query' }, { status: 500 });
  }
}
