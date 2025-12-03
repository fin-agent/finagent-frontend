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
    console.log('Trade summary request body:', JSON.stringify(body, null, 2));

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
      .select('SecurityType, TradeType')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    if (error) {
      return NextResponse.json({
        response: `Error looking up trades for ${normalizedSymbol}: ${error.message}`,
      });
    }

    const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
    const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
    const totalTrades = stockTrades + optionTrades;

    if (totalTrades === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}.`,
      });
    }

    return NextResponse.json({
      response: `For ${normalizedSymbol}: Found ${stockTrades} stock trades and ${optionTrades} option trades. Total: ${totalTrades} trades.`,
    });
  } catch (error) {
    console.error('Trade summary error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error looking up the trade summary.',
    });
  }
}
