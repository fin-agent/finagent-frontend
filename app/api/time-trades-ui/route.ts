import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { resolveDateFilter, parseTimePeriodToResolvedDates, type ResolvedDates } from '@/src/lib/date-parser';
import { formatDisplayDate, formatDateRange } from '@/src/lib/date-utils';
import { getTradeGrossUSD, safeParseNumber } from '@/src/lib/trade-math';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { checkDataAvailability } from '@/src/lib/data-availability';
import type { DateFilter } from '@/src/lib/intent-detection/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, timePeriod, dateFilter } = body;

    if (!timePeriod && !dateFilter) {
      return NextResponse.json({ error: 'Time period is required' }, { status: 400 });
    }

    // Resolve dates: prefer dateFilter from LLM, fallback to regex parsing
    let resolved: ResolvedDates | null = null;

    if (dateFilter) {
      // Use LLM-provided structured date filter
      resolved = resolveDateFilter(dateFilter as DateFilter);
    } else if (timePeriod) {
      // Fallback: parse time period string with regex
      resolved = parseTimePeriodToResolvedDates(timePeriod);
    }

    if (!resolved) {
      return NextResponse.json({ error: 'Invalid time period' }, { status: 400 });
    }

    const { startDate, endDate, dates, description } = resolved;

    // Build the query based on date type (range vs discrete)
    let query = supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    if (resolved.type === 'discrete' && dates && dates.length > 0) {
      // Discrete dates: query specific dates
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      // Range query
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    query = query.order('Date', { ascending: false });

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

    // If no trades found, check data availability for helpful suggestion
    if (trades.length === 0) {
      const { suggestion, availableRange } = await checkDataAvailability('TradeData', resolved);

      return NextResponse.json({
        timePeriod: {
          description,
          displayRange: resolved.type === 'discrete' && dates
            ? dates.map(d => formatDisplayDate(d)).join(', ')
            : formatDateRange(startDate || '', endDate || ''),
          tradingDays: resolved.type === 'discrete' && dates ? dates.length : 1,
        },
        summary: {
          totalTrades: 0,
          stockCount: 0,
          optionCount: 0,
          totalValue: 0,
          averagePrice: 0,
        },
        trades: [],
        symbol: normalizedSymbol,
        suggestion,
        availableRange: availableRange.hasData ? {
          earliestDate: availableRange.earliestDate,
          latestDate: availableRange.latestDate,
        } : null,
      });
    }

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

    // Calculate trading days for display
    let tradingDaysCount = 1;
    if (resolved.type === 'discrete' && dates && dates.length > 0) {
      tradingDaysCount = dates.length;
    } else if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      tradingDaysCount = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }

    return NextResponse.json({
      timePeriod: {
        description,
        displayRange: resolved.type === 'discrete' && dates
          ? dates.map(d => formatDisplayDate(d)).join(', ')
          : formatDateRange(startDate || '', endDate || ''),
        tradingDays: tradingDaysCount,
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
