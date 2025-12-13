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

    // Match trades using proper FIFO - each sell matches with earliest unmatched buy BEFORE it
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
      const buys = buyTrades
        .filter(t => t.SecurityType === secType)
        .map(t => ({ ...t, matched: false }));
      const sells = sellTrades.filter(t => t.SecurityType === secType);

      // For each sell, find the earliest unmatched buy that occurred on or before the sell date
      for (const sell of sells) {
        const sellDate = new Date(sell.Date);

        // Find earliest unmatched buy before or on the sell date
        const matchingBuy = buys.find(buy =>
          !buy.matched && new Date(buy.Date) <= sellDate
        );

        if (matchingBuy) {
          matchingBuy.matched = true;

          // Helper to safely parse numeric values (handles null, undefined, empty strings)
          const safeParseFloat = (val: unknown): number => {
            if (val === null || val === undefined || val === '') return 0;
            const parsed = parseFloat(String(val));
            return isNaN(parsed) ? 0 : parsed;
          };

          const buyPrice = safeParseFloat(matchingBuy.StockTradePrice) || safeParseFloat(matchingBuy.OptionTradePremium);
          const sellPrice = safeParseFloat(sell.StockTradePrice) || safeParseFloat(sell.OptionTradePremium);
          const quantity = safeParseFloat(matchingBuy.StockShareQty) || safeParseFloat(matchingBuy.OptionContracts);

          // Calculate profit based on actual prices: (sellPrice - buyPrice) * quantity
          const profitLoss = (sellPrice - buyPrice) * quantity;

          matchedTrades.push({
            securityType: secType === 'S' ? 'Stock' : 'Option',
            buyDate: formatCalendarDate(matchingBuy.Date),
            sellDate: formatCalendarDate(sell.Date),
            quantity,
            buyPrice,
            sellPrice,
            profitLoss,
          });
        }
      }
    }

    // Filter to only profitable (sellPrice > buyPrice) and sort by profit descending
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
