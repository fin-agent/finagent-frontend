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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Fetch buy trades
    const { data: buyTrades, error: buyError } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .eq('TradeType', 'B')
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (buyError) {
      return NextResponse.json({ error: buyError.message }, { status: 500 });
    }

    // Fetch sell trades
    const { data: sellTrades, error: sellError } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .ilike('TradeType', 'S')
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (sellError) {
      return NextResponse.json({ error: sellError.message }, { status: 500 });
    }

    if (!buyTrades?.length || !sellTrades?.length) {
      return NextResponse.json({
        symbol: normalizedSymbol,
        totalProfitableTrades: 0,
        totalProfit: 0,
        trades: [],
      });
    }

    // Match trades using FIFO by security type
    interface MatchedTrade {
      securityType: string;
      buyDate: string;
      sellDate: string;
      quantity: number;
      buyPrice: number;
      sellPrice: number;
      profitLoss: number;
    }

    const matchedTrades: MatchedTrade[] = [];
    const securityTypes = ['S', 'O'];

    for (const secType of securityTypes) {
      const buys = buyTrades.filter(t => t.SecurityType === secType);
      const sells = sellTrades.filter(t => t.SecurityType === secType);
      const matchCount = Math.min(buys.length, sells.length);

      for (let i = 0; i < matchCount; i++) {
        const buy = buys[i];
        const sell = sells[i];
        const profitLoss = (parseFloat(sell.NetAmount) || 0) + (parseFloat(buy.NetAmount) || 0);

        matchedTrades.push({
          securityType: secType === 'S' ? 'Stock' : 'Option',
          // Format dates with offset applied for display
          buyDate: formatCalendarDate(buy.Date),
          sellDate: formatCalendarDate(sell.Date),
          quantity: parseFloat(buy.StockShareQty || buy.OptionContracts || '0'),
          buyPrice: parseFloat(buy.StockTradePrice || buy.OptionTradePremium || '0'),
          sellPrice: parseFloat(sell.StockTradePrice || sell.OptionTradePremium || '0'),
          profitLoss,
        });
      }
    }

    // Filter to only profitable and sort
    const profitableTrades = matchedTrades
      .filter(t => t.profitLoss > 0)
      .sort((a, b) => b.profitLoss - a.profitLoss);

    const totalProfit = profitableTrades.reduce((sum, t) => sum + t.profitLoss, 0);

    return NextResponse.json({
      symbol: normalizedSymbol,
      totalProfitableTrades: profitableTrades.length,
      totalProfit,
      trades: profitableTrades,
    });
  } catch (error) {
    console.error('Profitable trades UI error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
