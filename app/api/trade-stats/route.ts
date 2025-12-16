import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, getDateOffset } from '@/src/lib/date-utils';
import { parseTimeExpression } from '@/src/lib/date-parser';

// Format raw database date without offset (for "this year" queries)
// Database dates are already in the correct year, no conversion needed
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

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

// Returns structured trade stats for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, tradeType, year, timePeriod } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Get the date offset to map user's year to demo database year
    const offset = getDateOffset();
    const userYear = year || new Date().getFullYear();
    const offsetYears = Math.round(offset / 365);
    const dbYear = userYear + offsetYears;

    let dateStart: string;
    let dateEnd: string;
    let timePeriodDescription: string | null = null;

    // If timePeriod is provided, parse it to get date range
    if (timePeriod) {
      const parsedTime = parseTimeExpression(timePeriod);
      if (parsedTime) {
        dateStart = parsedTime.dateRange.startDate;
        dateEnd = parsedTime.dateRange.endDate;
        timePeriodDescription = parsedTime.dateRange.description;
      } else {
        // Fallback to full year if parsing fails
        dateStart = `${dbYear}-01-01`;
        dateEnd = `${dbYear}-12-31`;
      }
    } else {
      // Default to full year
      dateStart = `${dbYear}-01-01`;
      dateEnd = `${dbYear}-12-31`;
    }

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'S')
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .gte('Date', dateStart)
      .lte('Date', dateEnd);

    if (tradeType) {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ stats: null });
    }

    // Filter to valid trades only (both price and shares must be positive)
    // This matches the voice endpoint logic for consistency
    const validTrades = data
      .map(t => ({
        price: parseFloat(t.StockTradePrice || '0'),
        shares: parseFloat(t.StockShareQty || '0'),
        trade: t,
      }))
      .filter(t => t.price > 0 && t.shares > 0);

    const prices = validTrades.map(t => t.price);
    const totalShares = validTrades.reduce((sum, t) => sum + t.shares, 0);
    const totalValue = validTrades.reduce((sum, t) => sum + t.price * t.shares, 0);

    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const avgPrice = totalShares > 0 ? totalValue / totalShares : 0;

    const highestTrade = validTrades.find(t => t.price === highestPrice)?.trade;
    const lowestTrade = validTrades.find(t => t.price === lowestPrice)?.trade;

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : 'all';

    // For "this year" queries (no timePeriod), use raw dates - database dates are already correct
    // For relative time queries ("last month", etc.), use offset-adjusted dates
    const formatDate = timePeriodDescription ? formatCalendarDate : formatRawDate;

    return NextResponse.json({
      stats: {
        symbol: normalizedSymbol,
        year: userYear, // Return user's requested year, not DB year
        tradeType: typeLabel,
        timePeriod: timePeriodDescription, // e.g., "last month", "last week", null for full year
        highestPrice,
        highestPriceDate: highestTrade?.Date ? formatDate(highestTrade.Date) : null,
        highestPriceShares: highestTrade ? parseFloat(highestTrade.StockShareQty || '0') : 0,
        lowestPrice,
        lowestPriceDate: lowestTrade?.Date ? formatDate(lowestTrade.Date) : null,
        lowestPriceShares: lowestTrade ? parseFloat(lowestTrade.StockShareQty || '0') : 0,
        averagePrice: avgPrice,
        totalTrades: validTrades.length,
        totalShares,
        totalValue,
      },
    });
  } catch (error) {
    console.error('Trade stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
