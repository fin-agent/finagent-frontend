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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Detailed trades request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

    if (error) {
      return NextResponse.json({
        response: `Error getting trade details for ${normalizedSymbol}: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}.`,
      });
    }

    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');
    const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

    const totalSharesPurchased = buyTrades.reduce((sum, t) =>
      sum + parseFloat(t.StockShareQty || '0'), 0);
    const totalCost = buyTrades.reduce((sum, t) =>
      sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    const lastPrice = stockTrades[0]?.StockTradePrice
      ? parseFloat(stockTrades[0].StockTradePrice)
      : 0;
    const currentValue = totalSharesPurchased * lastPrice;
    const profitLoss = currentValue - totalCost;
    const profitLossPercent = totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0;

    let response = `Detailed ${normalizedSymbol} trades:\n`;
    response += `Total shares purchased: ${totalSharesPurchased}\n`;
    response += `Total cost: $${totalCost.toFixed(2)}\n`;
    response += `Current estimated value: $${currentValue.toFixed(2)}\n`;
    response += `Profit/Loss: $${profitLoss.toFixed(2)} (${profitLossPercent.toFixed(2)}%)\n`;
    response += `Stock trades: ${stockTrades.length}, Option trades: ${optionTrades.length}`;

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Detailed trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the detailed trades.',
    });
  }
}
