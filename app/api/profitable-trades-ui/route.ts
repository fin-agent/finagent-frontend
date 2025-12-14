import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimeExpression } from '@/src/lib/date-parser';
import { calculateRealizedMatchesFIFO, filterProfitableTrades } from '@/src/lib/profitable-trades';

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol;
    const timePeriod: string | undefined = body.timePeriod;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const parsedTime = timePeriod ? parseTimeExpression(timePeriod) : null;
    const dateStart = parsedTime?.dateRange.startDate;
    const dateEnd = parsedTime?.dateRange.endDate;

    // Fetch all trades up to end date (buys before the period can close within the period)
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (dateEnd) {
      query = query.lte('Date', dateEnd);
    }

    const { data: allTrades, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const trades = allTrades || [];
    if (trades.length === 0) {
      return NextResponse.json({
        symbol: normalizedSymbol,
        totalProfitableTrades: 0,
        totalProfit: 0,
        trades: [],
      });
    }

    const matchedTrades = calculateRealizedMatchesFIFO(trades, normalizedSymbol);
    const { profitableTrades, totalProfit } = filterProfitableTrades(matchedTrades, dateStart, dateEnd);

    return NextResponse.json({
      symbol: normalizedSymbol,
      timePeriod: parsedTime?.dateRange.description || timePeriod || null,
      totalProfitableTrades: profitableTrades.length,
      totalProfit,
      trades: profitableTrades,
    });
  } catch (error) {
    console.error('Profitable trades UI error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
