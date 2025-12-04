import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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

// Returns structured trade data for UI rendering
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = body.symbol;

    if (!symbol) {
      return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ trades: [], summary: null });
    }

    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

    const totalSharesPurchased = buyTrades.reduce((sum, t) =>
      sum + parseFloat(t.StockShareQty || '0'), 0);
    const totalCost = buyTrades.reduce((sum, t) =>
      sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const lastPrice = stockTrades[0]?.StockTradePrice
      ? parseFloat(stockTrades[0].StockTradePrice)
      : 0;
    const currentValue = totalSharesPurchased * lastPrice;

    // Format trades for the TradesTable component
    const trades = data.map(t => ({
      TradeID: t.TradeID,
      Date: t.Date,
      Symbol: t.Symbol || normalizedSymbol,
      SecurityType: t.SecurityType,
      TradeType: t.TradeType,
      StockTradePrice: t.StockTradePrice || '0',
      StockShareQty: t.StockShareQty || '0',
      OptionContracts: t.OptionContracts || '0',
      OptionTradePremium: t.OptionTradePremium || '0',
      GrossAmount: t.GrossAmount || '0',
      NetAmount: t.NetAmount || '0',
      Strike: t.Strike,
      Expiration: t.Expiration,
      'Call/Put': t['Call/Put'],
    }));

    const summary = {
      totalShares: totalSharesPurchased,
      totalCost,
      currentValue,
      symbol: normalizedSymbol,
    };

    return NextResponse.json({ trades, summary });
  } catch (error) {
    console.error('Trades UI API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
