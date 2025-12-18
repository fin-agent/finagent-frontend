import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { calculateRealizedMatchesFIFO, filterProfitableTrades } from '@/src/lib/profitable-trades';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Profitable trades request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data: trades, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: true })
      .order('TradeID', { ascending: true });

    if (error) {
      return NextResponse.json({
        response: `Error fetching trades: ${error.message}`,
      });
    }

    const allTrades = trades || [];
    if (allTrades.length === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}.`,
      });
    }

    const matchedTrades = calculateRealizedMatchesFIFO(allTrades, normalizedSymbol);
    const { profitableTrades, totalProfit } = filterProfitableTrades(matchedTrades);

    if (profitableTrades.length === 0) {
      return NextResponse.json({
        response: `No completed profitable trades found for ${normalizedSymbol}. Your positions may still be open.`,
      });
    }

    const top = profitableTrades[0];
    const response = top
      ? `For ${normalizedSymbol}, you have ${profitableTrades.length} profitable trades with total realized profit $${totalProfit.toFixed(2)}. Your top profit was $${top.profitLoss.toFixed(2)} from ${top.buyDate} to ${top.sellDate}.`
      : `For ${normalizedSymbol}, you have ${profitableTrades.length} profitable trades with total realized profit $${totalProfit.toFixed(2)}.`;

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Profitable trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the profitable trades.',
    });
  }
}
