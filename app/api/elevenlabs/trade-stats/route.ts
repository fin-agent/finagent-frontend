import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getDateOffset } from '@/src/lib/date-utils';
import { parseTimeExpression } from '@/src/lib/date-parser';
import { normalizeSymbol, symbolToCompanyName } from '@/src/lib/symbol-utils';
import { formatCurrencyForTTS, formatNumberForTTS } from '@/src/lib/tts-utils';

// Format date for voice - shows raw database dates (no offset)
// For "this year" queries, database dates are already 2025 dates
function formatDateForVoice(dateStr: string): string {
  if (!dateStr) return 'N/A';

  // Extract YYYY-MM-DD part
  const datePart = dateStr.split('T')[0];
  const [year, month, day] = datePart.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) return dateStr;

  // Format as "August 12, 2025" for TTS
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';


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

    // Use company name for natural voice output (e.g., "Tesla" instead of "T S L A")
    const companyName = symbolToCompanyName(normalizedSymbol);

    if (!data || data.length === 0) {
      const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : '';
      return NextResponse.json({
        response: `No ${typeLabel} trades found for ${companyName} ${periodDescription}.`,
      });
    }

    // Filter to valid trades only (both price and shares must be positive)
    const validTrades = data
      .map(t => ({
        price: parseFloat(t.StockTradePrice || '0'),
        shares: parseFloat(t.StockShareQty || '0'),
      }))
      .filter(t => t.price > 0 && t.shares > 0);

    const prices = validTrades.map(t => t.price);
    const totalShares = validTrades.reduce((sum, t) => sum + t.shares, 0);
    const totalNotional = validTrades.reduce((sum, t) => sum + t.price * t.shares, 0);
    const totalValue = totalNotional;

    const highestPrice = prices.length > 0 ? Math.max(...prices) : 0;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const avgPrice = totalShares > 0 ? totalNotional / totalShares : 0;

    const highestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === highestPrice);
    const lowestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === lowestPrice);

    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sold' : 'bought') : 'traded';

    // Format response with numeric values (not spelled out)
    const highShareQty = parseFloat(highestTrade?.StockShareQty || '0');
    const lowShareQty = parseFloat(lowestTrade?.StockShareQty || '0');

    // Format dates WITHOUT offset - must match UI display
    const highDate = highestTrade?.Date ? formatDateForVoice(highestTrade.Date) : 'N/A';
    const lowDate = lowestTrade?.Date ? formatDateForVoice(lowestTrade.Date) : 'N/A';

    let response = `${companyName} trade statistics for ${periodDescription}: `;
    response += `Highest price ${typeLabel}: ${formatCurrencyForTTS(highestPrice)} on ${highDate} for ${formatNumberForTTS(highShareQty)} shares. `;
    response += `Lowest price ${typeLabel}: ${formatCurrencyForTTS(lowestPrice)} on ${lowDate} for ${formatNumberForTTS(lowShareQty)} shares. `;
    response += `Average price: ${formatCurrencyForTTS(avgPrice)}. `;
    response += `Total: ${formatNumberForTTS(data.length)} trades, ${formatNumberForTTS(totalShares)} shares, ${formatCurrencyForTTS(totalValue)} total value.`;

    return NextResponse.json({ response });
  } catch (error) {
    console.error('Trade stats error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the trade statistics.',
    });
  }
}
