import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimeExpression } from '@/src/lib/date-parser';
import { formatDisplayDate, formatDateRange, formatCalendarDate } from '@/src/lib/date-utils';

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
  'qualcomm': 'QCOM',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Time trades request body:', JSON.stringify(body, null, 2));

    // Extract parameters - support various nesting patterns from ElevenLabs
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period;
    const symbol = body.symbol || body.parameters?.symbol ||
                   body.body?.symbol || body.body?.parameters?.symbol;
    const calculation = body.calculation || body.parameters?.calculation ||
                        body.body?.calculation || body.body?.parameters?.calculation;
    const tradeType = body.trade_type || body.parameters?.trade_type ||
                      body.body?.trade_type || body.body?.parameters?.trade_type;

    if (!timePeriod) {
      return NextResponse.json({
        response: 'Please specify a time period like "last week", "yesterday", "past 5 days", "November 18th", or a day name like "Monday".',
      });
    }

    // Parse the time period
    const parsedTime = parseTimeExpression(timePeriod);
    if (!parsedTime) {
      return NextResponse.json({
        response: `I couldn't understand the time period "${timePeriod}". Try "last week", "yesterday", "past 5 days", "November 18th", "this month", or a day name like "Monday".`,
      });
    }

    const { startDate, endDate, description, tradingDays } = parsedTime.dateRange;
    console.log(`Parsed time period: ${description}, DB dates: ${startDate} to ${endDate}`);

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

    // Filter by trade type if provided
    if (tradeType && tradeType.toLowerCase() !== 'all') {
      const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
      query = query.eq('TradeType', normalizedType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        response: `Error fetching trades: ${error.message}`,
      });
    }

    const trades = data || [];
    const tradeCount = trades.length;

    // Build response based on results
    const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
    const tradingDaysText = tradingDays && tradingDays > 1 ? ` over ${tradingDays} trading days` : '';

    if (tradeCount === 0) {
      return NextResponse.json({
        response: `No trades found${symbolText} ${description}.`,
        data: {
          tradeCount: 0,
          timePeriod: description,
          symbol: normalizedSymbol,
          trades: [],
        }
      });
    }

    // Calculate statistics
    const stockTrades = trades.filter(t => t.SecurityType === 'S');
    const optionTrades = trades.filter(t => t.SecurityType === 'O');
    const stockCount = stockTrades.length;
    const optionCount = optionTrades.length;

    // Calculate average price if requested
    let statsText = '';
    if (calculation === 'average') {
      const prices = stockTrades
        .map(t => parseFloat(t.StockTradePrice || '0'))
        .filter(p => p > 0);
      if (prices.length > 0) {
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        statsText = ` The average price was $${avgPrice.toFixed(2)}.`;
      }
    }

    // Calculate total value
    const totalValue = trades.reduce((sum, t) => {
      const netAmount = Math.abs(parseFloat(t.NetAmount || '0'));
      return sum + netAmount;
    }, 0);

    // Format dates for display
    const displayRange = formatDateRange(startDate, endDate);

    // Build detailed trade descriptions for agent to read
    // Group trades by type for clearer verbal response
    const stockTradeDescriptions = stockTrades.slice(0, 5).map(t => {
      const action = t.TradeType === 'B' ? 'Bought' : 'Sold';
      const shares = parseInt(t.StockShareQty || '0');
      const price = parseFloat(t.StockTradePrice || '0');
      const net = Math.abs(parseFloat(t.NetAmount || '0'));
      return `${formatCalendarDate(t.Date)}: ${action} ${shares} shares of ${t.Symbol} at $${price.toFixed(2)} (net $${net.toFixed(2)})`;
    });

    const optionTradeDescriptions = optionTrades.slice(0, 5).map(t => {
      const action = t.TradeType === 'B' ? 'Bought' : 'Sold';
      const contracts = parseInt(t.OptionContracts || '0');
      const premium = parseFloat(t.OptionTradePremium || '0');
      const net = Math.abs(parseFloat(t.NetAmount || '0'));
      const callPut = t['Call/Put'] === 'C' ? 'call' : 'put';
      const underlying = t.UnderlyingSymbol || t.Symbol.substring(0, 4);
      const strike = t.Strike ? `$${t.Strike}` : '';
      return `${formatCalendarDate(t.Date)}: ${action} ${contracts} ${underlying} ${strike} ${callPut} options at $${premium.toFixed(2)} premium (net $${net.toFixed(2)})`;
    });

    // Build response message with explicit counts
    let response: string;
    const totalValueStr = `$${totalValue.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

    // Always state the exact counts clearly
    const summaryLine = `You executed ${tradeCount} total trades${symbolText} ${description} from ${displayRange}: ${stockCount} stock trade${stockCount !== 1 ? 's' : ''} and ${optionCount} option trade${optionCount !== 1 ? 's' : ''} with a total value of ${totalValueStr}.`;

    // Add detailed breakdown if there are trades
    let detailSection = '';
    if (stockCount > 0 && stockTradeDescriptions.length > 0) {
      detailSection += `\n\nStock Trades (${stockCount}):\n- ${stockTradeDescriptions.join('\n- ')}`;
      if (stockCount > 5) detailSection += `\n- ... and ${stockCount - 5} more stock trades`;
    }
    if (optionCount > 0 && optionTradeDescriptions.length > 0) {
      detailSection += `\n\nOption Trades (${optionCount}):\n- ${optionTradeDescriptions.join('\n- ')}`;
      if (optionCount > 5) detailSection += `\n- ... and ${optionCount - 5} more option trades`;
    }

    response = summaryLine + detailSection + statsText;

    // Convert individual dates for display (applying date offset)
    const displayStartDate = formatDisplayDate(startDate);
    const displayEndDate = formatDisplayDate(endDate);

    return NextResponse.json({
      response,
      data: {
        tradeCount,
        stockCount,
        optionCount,
        timePeriod: description,
        displayRange,
        tradingDays,
        // Use display-formatted dates so agent uses correct dates
        startDate: displayStartDate,
        endDate: displayEndDate,
        dateRange: displayRange, // Also provide explicit date range string
        symbol: normalizedSymbol,
        totalValue: Math.round(totalValue * 100) / 100,
        trades: trades.map(t => ({
          ...t,
          // Replace raw DB date with formatted display date (offset applied)
          Date: formatCalendarDate(t.Date),
          displayDate: formatDisplayDate(t.Date),
        })),
      }
    });
  } catch (error) {
    console.error('Time trades error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error looking up your trades for that time period.',
    });
  }
}
