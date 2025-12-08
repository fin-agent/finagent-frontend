import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getDateOffset } from '@/src/lib/date-utils';
import { parseTimeExpression } from '@/src/lib/date-parser';

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

// Returns focused average price data for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, tradeType, timePeriod } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Get the date offset to map user's year to demo database year
    const offset = getDateOffset();
    const userYear = new Date().getFullYear();
    const offsetYears = Math.round(offset / 365);
    const dbYear = userYear + offsetYears;

    let dateStart: string;
    let dateEnd: string;
    let timePeriodDescription: string = timePeriod || 'this year';

    // If timePeriod is provided, parse it to get date range
    if (timePeriod) {
      const parsedTime = parseTimeExpression(timePeriod);
      if (parsedTime) {
        dateStart = parsedTime.dateRange.startDate;
        dateEnd = parsedTime.dateRange.endDate;
        timePeriodDescription = parsedTime.dateRange.description || timePeriod;
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

    // Only filter by trade type if explicitly specified (not 'all')
    if (tradeType && tradeType !== 'all') {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      console.error('Average price API error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        averagePrice: null,
        symbol: normalizedSymbol,
        timePeriod: timePeriodDescription,
        tradeType: tradeType || 'all',
        message: 'No trades found for this period',
      });
    }

    const prices = data.map(t => parseFloat(t.StockTradePrice || '0')).filter(p => p > 0);
    const shares = data.map(t => parseFloat(t.StockShareQty || '0'));
    const totalShares = shares.reduce((a, b) => a + b, 0);

    if (prices.length === 0) {
      return NextResponse.json({
        averagePrice: null,
        symbol: normalizedSymbol,
        timePeriod: timePeriodDescription,
        tradeType: tradeType || 'all',
        message: 'No valid price data found',
      });
    }

    const highestPrice = Math.max(...prices);
    const lowestPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    // Determine actual trade type from data if not specified
    let actualTradeType = tradeType || 'all';
    if (!tradeType || tradeType === 'all') {
      const buyCount = data.filter(t => t.TradeType === 'B').length;
      const sellCount = data.filter(t => t.TradeType === 'S').length;
      if (buyCount > 0 && sellCount === 0) actualTradeType = 'buy';
      else if (sellCount > 0 && buyCount === 0) actualTradeType = 'sell';
    }

    return NextResponse.json({
      symbol: normalizedSymbol,
      averagePrice: avgPrice,
      highestPrice,
      lowestPrice,
      totalTrades: data.length,
      totalShares,
      timePeriod: timePeriodDescription,
      tradeType: actualTradeType,
    });
  } catch (error) {
    console.error('Average price API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
