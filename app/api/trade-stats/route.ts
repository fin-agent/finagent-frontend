import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate } from '@/src/lib/date-utils';

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
    const { symbol, tradeType, year } = body;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);
    const filterYear = year || new Date().getFullYear();
    const yearStart = `${filterYear}-01-01`;
    const yearEnd = `${filterYear}-12-31`;

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'S')
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .gte('Date', yearStart)
      .lte('Date', yearEnd);

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

    const prices = data.map(t => parseFloat(t.StockTradePrice || '0')).filter(p => p > 0);
    const shares = data.map(t => parseFloat(t.StockShareQty || '0'));
    const totalShares = shares.reduce((a, b) => a + b, 0);
    const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const highestPrice = Math.max(...prices);
    const lowestPrice = Math.min(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    const highestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === highestPrice);
    const lowestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === lowestPrice);

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : 'all';

    return NextResponse.json({
      stats: {
        symbol: normalizedSymbol,
        year: filterYear,
        tradeType: typeLabel,
        highestPrice,
        // Format dates with offset applied for display
        highestPriceDate: highestTrade?.Date ? formatCalendarDate(highestTrade.Date) : null,
        highestPriceShares: highestTrade ? parseFloat(highestTrade.StockShareQty || '0') : 0,
        lowestPrice,
        lowestPriceDate: lowestTrade?.Date ? formatCalendarDate(lowestTrade.Date) : null,
        lowestPriceShares: lowestTrade ? parseFloat(lowestTrade.StockShareQty || '0') : 0,
        averagePrice: avgPrice,
        totalTrades: data.length,
        totalShares,
        totalValue,
      },
    });
  } catch (error) {
    console.error('Trade stats API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
