import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, getDateOffset } from '@/src/lib/date-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Format price as currency - keep in numeric form
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// Format number with commas
function formatNumber(num: number): string {
  return Math.round(num).toLocaleString();
}

// The ElevenLabs LLM should pass the ticker symbol directly
// No need to maintain a symbol map - the LLM knows company→ticker mappings
function normalizeSymbol(input: string): string {
  return input.toUpperCase().trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Trade stats request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;
    const tradeType = body.trade_type || body.parameters?.trade_type;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Get the date offset to map user's year to demo database year
    const offset = getDateOffset();
    const userYear = new Date().getFullYear();

    // Convert user's year to demo database year by adding the offset
    const offsetYears = Math.round(offset / 365);
    const dbYear = userYear + offsetYears;

    const yearStart = `${dbYear}-01-01`;
    const yearEnd = `${dbYear}-12-31`;

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
      return NextResponse.json({
        response: `Error getting trade stats: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : '';
      return NextResponse.json({
        response: `No ${typeLabel} trades found for ${normalizedSymbol} in ${userYear}.`,
      });
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

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sold' : 'bought') : 'traded';

    // Format response with numeric values (not spelled out)
    const highShareQty = parseFloat(highestTrade?.StockShareQty || '0');
    const lowShareQty = parseFloat(lowestTrade?.StockShareQty || '0');

    // Format dates with offset applied for display
    const highDate = highestTrade?.Date ? formatCalendarDate(highestTrade.Date) : 'N/A';
    const lowDate = lowestTrade?.Date ? formatCalendarDate(lowestTrade.Date) : 'N/A';

    let response = `${normalizedSymbol} trade statistics for ${userYear}: `;
    response += `Highest price ${typeLabel}: ${formatPrice(highestPrice)} on ${highDate} for ${formatNumber(highShareQty)} shares. `;
    response += `Lowest price ${typeLabel}: ${formatPrice(lowestPrice)} on ${lowDate} for ${formatNumber(lowShareQty)} shares. `;
    response += `Average price: ${formatPrice(avgPrice)}. `;
    response += `Total: ${formatNumber(data.length)} trades, ${formatNumber(totalShares)} shares, ${formatPrice(totalValue)} total value.`;

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Trade stats error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the trade statistics.',
    });
  }
}
