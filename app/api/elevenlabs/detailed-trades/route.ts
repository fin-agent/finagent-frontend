import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol, parseOptionSymbol, symbolToCompanyName } from '@/src/lib/symbol-utils';
import { formatCalendarDate } from '@/src/lib/date-utils';
import { formatCurrencyForTTS, formatNumberForTTS } from '@/src/lib/tts-utils';

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


export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Detailed trades request body:', JSON.stringify(body, null, 2));

    // ElevenLabs may send symbol directly or nested in various ways
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;

    if (!symbol) {
      return NextResponse.json({
        response: 'Please specify a stock symbol or company name.',
      });
    }

    const normalizedSymbol = normalizeSymbol(symbol);

    const { data, error } = await supabase
      .from('TradeData')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
      .order('Date', { ascending: false });

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
        response: `No trades found for ${normalizedSymbol}.`,
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

    // Use company name for natural voice output (e.g., "Tesla" instead of "T S L A")
    const companyName = symbolToCompanyName(normalizedSymbol);

    // Build response for TTS - matches UI display
    let response = `For ${companyName}, you have ${data.length} total trades: `;
    response += `${stockTrades.length} stock trades and ${optionTrades.length} option trades. `;
    response += `${buyCount} buys and ${sellCount} sells. `;
    response += `Total quantity: ${formatNumberForTTS(totalQuantity)}`;

    if (stockTrades.length > 0 && optionTrades.length > 0) {
      response += ` (${formatNumberForTTS(totalShares)} shares and ${formatNumberForTTS(totalContracts)} contracts)`;
    }

    response += `. Total value: ${formatCurrencyForTTS(totalValue)} with an average of ${formatCurrencyForTTS(avgValue)} per trade.`;

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
