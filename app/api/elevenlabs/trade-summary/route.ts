import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Trade summary request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
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
        uiData: null,
      });
    }

    const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
    const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
    const totalTrades = stockTrades + optionTrades;

    // Calculate buy/sell breakdown
    const buyTrades = data?.filter(t => t.TradeType === 'B').length || 0;
    const sellTrades = data?.filter(t => t.TradeType === 'S').length || 0;

    // Build uiData - SINGLE SOURCE OF TRUTH
    const uiData = {
      symbol: normalizedSymbol,
      totalTrades,
      stockTrades,
      optionTrades,
      buyTrades,
      sellTrades,
    };

    if (totalTrades === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}.`,
        uiData,
      });
    }

    return NextResponse.json({
      response: `For ${normalizedSymbol}: Found ${stockTrades} stock trades and ${optionTrades} option trades. Total: ${totalTrades} trades.`,
      uiData,
    });
  } catch (error) {
    console.error('Trade summary error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error looking up the trade summary.',
      uiData: null,
    });
  }
}
