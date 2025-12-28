import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

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
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
        uiData: null,
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string = timePeriod || '';
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // LLM has resolved the dates in real calendar time - convert to demo database dates
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realDateToDemoDate(realStart));
      endDate = formatDateForDB(realDateToDemoDate(realEnd));
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: real ${dateFilter.startDate} to ${dateFilter.endDate} -> demo ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates in real calendar time - convert each to demo dates
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const realDate = new Date(y, m - 1, day);
        return formatDateForDB(realDateToDemoDate(realDate));
      });
      resolvedType = 'discrete';
      description = dateFilter.description || timePeriod || 'selected dates';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (timePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
      const resolved = parseTimePeriodToResolvedDates(timePeriod);
      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates) {
          dates = resolved.dates;
          resolvedType = 'discrete';
        } else if (resolved.startDate && resolved.endDate) {
          startDate = resolved.startDate;
          endDate = resolved.endDate;
        }
        description = resolved.description || timePeriod;
        console.log(`Parsed timePeriod "${timePeriod}": ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
      } else {
        description = timePeriod;
        console.log(`Could not parse timePeriod "${timePeriod}", querying all data`);
      }
    }

    // Build query with optional date filtering
    let query = supabase
      .from('TradeData')
      .select('SecurityType, TradeType, Date')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    // Apply date filters
    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    const { data, error } = await query;

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

    // Build time period label for responses
    const periodLabelFor = description ? ` for ${description}` : '';

    // Build uiData - SINGLE SOURCE OF TRUTH
    const uiData = {
      symbol: normalizedSymbol,
      totalTrades,
      stockTrades,
      optionTrades,
      buyTrades,
      sellTrades,
      timePeriod: description || undefined,
    };

    if (totalTrades === 0) {
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}${periodLabelFor}.`,
        uiData,
      });
    }

    return NextResponse.json({
      response: `For ${normalizedSymbol}${periodLabelFor}: Found ${stockTrades} stock trades and ${optionTrades} option trades. Total: ${totalTrades} trades.`,
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
