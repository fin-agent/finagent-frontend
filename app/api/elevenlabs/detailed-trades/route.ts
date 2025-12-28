import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol, parseOptionSymbol } from '@/src/lib/symbol-utils';
import { formatCalendarDate, realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
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

// UI data structure for TradesTable component
interface DetailedTradesUIData {
  symbol: string;
  tradeCount: number;
  stockCount: number;
  optionCount: number;
  buyCount: number;
  sellCount: number;
  totalShares: number;
  totalContracts: number;
  totalQuantity: number;
  totalValue: number;
  avgValue: number;
  trades: Array<{
    Date: string;
    Symbol: string;
    TradeType: string;
    SecurityType: string;
    StockShareQty?: string;
    OptionContracts?: string;
    StockTradePrice?: string;
    OptionTradePremium?: string;
    NetAmount?: string;
  }>;
}

// Format number for TTS (no commas)
function formatNumber(num: number): string {
  return Math.round(num).toString();
}

// Format currency for TTS
function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Detailed trades request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter ||
                       body.body?.date_filter || body.body?.parameters?.date_filter;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
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
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

    // Apply date filters
    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      console.log(`🔍 [DEBUG] Applying discrete date filter: ${dates.join(', ')}`);
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      console.log(`🔍 [DEBUG] Applying range date filter: ${startDate} to ${endDate}`);
      query = query.gte('Date', startDate).lte('Date', endDate);
    } else {
      console.log(`🔍 [DEBUG] NO date filter applied! startDate=${startDate}, endDate=${endDate}, dates=${dates}`);
    }

    query = query.order('Date', { ascending: false });

    const { data, error } = await query;
    console.log(`🔍 [DEBUG] Query returned ${data?.length || 0} rows`);

    if (error) {
      const uiData: DetailedTradesUIData = {
        symbol: normalizedSymbol,
        tradeCount: 0,
        stockCount: 0,
        optionCount: 0,
        buyCount: 0,
        sellCount: 0,
        totalShares: 0,
        totalContracts: 0,
        totalQuantity: 0,
        totalValue: 0,
        avgValue: 0,
        trades: [],
      };
      return NextResponse.json({
        response: `Error getting trade details for ${normalizedSymbol}: ${error.message}`,
        uiData,
      });
    }

    // Build time period label for responses
    const periodLabelFor = description ? ` for ${description}` : '';

    if (!data || data.length === 0) {
      const uiData: DetailedTradesUIData = {
        symbol: normalizedSymbol,
        tradeCount: 0,
        stockCount: 0,
        optionCount: 0,
        buyCount: 0,
        sellCount: 0,
        totalShares: 0,
        totalContracts: 0,
        totalQuantity: 0,
        totalValue: 0,
        avgValue: 0,
        trades: [],
      };
      return NextResponse.json({
        response: `No trades found for ${normalizedSymbol}${periodLabelFor}.`,
        uiData,
      });
    }

    // Separate stock and option trades
    const stockTrades = data.filter(t => t.SecurityType === 'S');
    const optionTrades = data.filter(t => t.SecurityType === 'O');

    // Count buys and sells across ALL trades
    const buyCount = data.filter(t => t.TradeType === 'B').length;
    const sellCount = data.filter(t => t.TradeType === 'S').length;

    // Calculate total quantities for ALL trades
    const totalShares = stockTrades.reduce((sum, t) =>
      sum + parseFloat(t.StockShareQty || '0'), 0);
    const totalContracts = optionTrades.reduce((sum, t) =>
      sum + parseFloat(t.OptionContracts || '0'), 0);
    const totalQuantity = totalShares + totalContracts;

    // Calculate total value (sum of absolute NetAmounts) for ALL trades
    const totalValue = data.reduce((sum, t) =>
      sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

    // Calculate average value per trade
    const avgValue = data.length > 0 ? totalValue / data.length : 0;

    // Build response for TTS
    let response = `For ${normalizedSymbol}${periodLabelFor}, you have ${data.length} total trades: `;
    response += `${stockTrades.length} stock trades and ${optionTrades.length} option trades. `;
    response += `${buyCount} buys and ${sellCount} sells. `;
    response += `Total quantity: ${formatNumber(totalQuantity)}`;

    if (stockTrades.length > 0 && optionTrades.length > 0) {
      response += ` (${formatNumber(totalShares)} shares and ${formatNumber(totalContracts)} contracts)`;
    }

    response += `. Total value: ${formatCurrency(totalValue)} with an average of ${formatCurrency(avgValue)} per trade.`;

    // Build UI data with all trade details
    const uiData: DetailedTradesUIData = {
      symbol: normalizedSymbol,
      tradeCount: data.length,
      stockCount: stockTrades.length,
      optionCount: optionTrades.length,
      buyCount,
      sellCount,
      totalShares,
      totalContracts,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      avgValue: Math.round(avgValue * 100) / 100,
      trades: data.slice(0, 50).map(t => ({
        Date: formatCalendarDate(t.Date),
        Symbol: parseOptionSymbol(t.Symbol),
        TradeType: t.TradeType,
        SecurityType: t.SecurityType,
        StockShareQty: t.StockShareQty,
        OptionContracts: t.OptionContracts,
        StockTradePrice: t.StockTradePrice,
        OptionTradePremium: t.OptionTradePremium,
        NetAmount: t.NetAmount,
      })),
    };

    return NextResponse.json({ response, uiData });
  } catch (error) {
    console.error('Detailed trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error getting the detailed trades.',
    });
  }
}
