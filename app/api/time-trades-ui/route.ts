import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimeExpression } from '@/src/lib/date-parser';
import { formatDisplayDate, formatDateRange } from '@/src/lib/date-utils';
import { getTradeGrossUSD, safeParseNumber } from '@/src/lib/trade-math';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timePeriod } = body;

    if (!timePeriod) {
      return NextResponse.json({ error: 'Time period is required' }, { status: 400 });
    }

    // Parse the time period
    const parsedTime = parseTimeExpression(timePeriod);
    if (!parsedTime) {
      return NextResponse.json({ error: 'Invalid time period' }, { status: 400 });
    }

    const { startDate, endDate, description, tradingDays } = parsedTime.dateRange;

    // Build the query
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .gte('Date', startDate)
      .lte('Date', endDate)
      .order('Date', { ascending: false });

    // Filter by symbol if provided
    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : null;
    if (normalizedSymbol) {
      query = query.or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const trades = data || [];

    // Calculate statistics
    const stockTrades = trades.filter(t => t.SecurityType === 'S');
    const optionTrades = trades.filter(t => t.SecurityType === 'O');

    const totalValue = trades.reduce((sum, trade) => {
      const netAbs = Math.abs(safeParseNumber(trade.NetAmount));
      const gross = getTradeGrossUSD(trade);
      return sum + (netAbs > 0 ? netAbs : gross);
    }, 0);

    // Calculate average price for stock trades
    const stockTotals = stockTrades.reduce((acc, trade) => {
      const price = safeParseNumber(trade.StockTradePrice);
      const shares = safeParseNumber(trade.StockShareQty);
      if (price > 0 && shares > 0) {
        acc.notional += price * shares;
        acc.shares += shares;
      }
      return acc;
    }, { notional: 0, shares: 0 });
    const averagePrice = stockTotals.shares > 0 ? stockTotals.notional / stockTotals.shares : 0;

    // Format trades with display dates
    const formattedTrades = trades.map(t => ({
      ...t,
      displayDate: formatDisplayDate(t.Date),
    }));

    return NextResponse.json({
      timePeriod: {
        description,
        displayRange: formatDateRange(startDate, endDate),
        tradingDays,
      },
      summary: {
        totalTrades: trades.length,
        stockCount: stockTrades.length,
        optionCount: optionTrades.length,
        totalValue: Math.round(totalValue * 100) / 100,
        averagePrice: Math.round(averagePrice * 100) / 100,
      },
      trades: formattedTrades,
      symbol: normalizedSymbol,
    });
  } catch (error) {
    console.error('Time trades UI error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
