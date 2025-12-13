import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatCalendarDate, getDateOffset } from '@/src/lib/date-utils';
import { parseTimeExpression } from '@/src/lib/date-parser';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Format price as currency - keep in numeric form
function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

// Format number without commas (TTS requires no commas - commas break speech synthesis)
function formatNumber(num: number): string {
  return Math.round(num).toString();
}

// Symbol mapping for common company names (fallback if agent doesn't convert)
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
    console.log('Trade stats request:', JSON.stringify(body, null, 2));

    const symbol = body.symbol || body.parameters?.symbol;
    const tradeType = body.trade_type || body.parameters?.trade_type;
    const timePeriod = body.time_period || body.parameters?.time_period;

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

    let dateStart: string;
    let dateEnd: string;
    let periodDescription: string;

    // If timePeriod is provided (e.g., "last month", "last week"), parse it
    if (timePeriod) {
      const parsedTime = parseTimeExpression(timePeriod);
      if (parsedTime) {
        dateStart = parsedTime.dateRange.startDate;
        dateEnd = parsedTime.dateRange.endDate;
        periodDescription = parsedTime.dateRange.description;
      } else {
        // Fallback to full year if parsing fails
        dateStart = `${dbYear}-01-01`;
        dateEnd = `${dbYear}-12-31`;
        periodDescription = `${userYear}`;
      }
    } else {
      // Default to full year
      dateStart = `${dbYear}-01-01`;
      dateEnd = `${dbYear}-12-31`;
      periodDescription = `${userYear}`;
    }

    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .eq('SecurityType', 'S')
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .gte('Date', dateStart)
      .lte('Date', dateEnd);

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
        response: `No ${typeLabel} trades found for ${normalizedSymbol} ${periodDescription}.`,
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

    let response = `${normalizedSymbol} trade statistics for ${periodDescription}: `;
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
