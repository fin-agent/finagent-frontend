import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

// Symbol mapping for common company names
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

// Tool: Get trade summary
async function getTradeSummary(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  const { data, error } = await supabase
    .from('TradeData')
    .select('SecurityType, TradeType')
    .eq('AccountCode', ACCOUNT_CODE)
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`);

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  const stockTrades = data?.filter(t => t.SecurityType === 'S').length || 0;
  const optionTrades = data?.filter(t => t.SecurityType === 'O').length || 0;
  const warrantTrades = data?.filter(t => t.SecurityType === 'W').length || 0;

  return {
    symbol: normalizedSymbol,
    stockTrades,
    optionTrades,
    warrantTrades,
    totalTrades: stockTrades + optionTrades + warrantTrades,
  };
}

// Tool: Get trade statistics (highest, lowest, average prices)
async function getTradeStats(symbol: string, tradeType?: string, year?: number) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const filterYear = year || new Date().getFullYear();
  const yearStart = `${filterYear}-01-01`;
  const yearEnd = `${filterYear}-12-31`;

  let query = supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE)
    .eq('SecurityType', 'S') // Stock trades only for price analysis
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
    .gte('Date', yearStart)
    .lte('Date', yearEnd);

  // Filter by trade type if specified (B = Buy, S = Sell)
  if (tradeType) {
    const normalizedType = tradeType.toLowerCase().startsWith('s') ? 'S' : 'B';
    query = query.eq('TradeType', normalizedType);
  }

  const { data, error } = await query.order('Date', { ascending: false });

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  if (!data || data.length === 0) {
    const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : '';
    return {
      symbol: normalizedSymbol,
      year: filterYear,
      tradeType: typeLabel,
      message: `No ${typeLabel} trades found for ${normalizedSymbol} in ${filterYear}.`,
      tradesFound: 0,
    };
  }

  // Calculate statistics
  const prices = data.map(t => parseFloat(t.StockTradePrice || '0')).filter(p => p > 0);
  const shares = data.map(t => parseFloat(t.StockShareQty || '0'));
  const totalShares = shares.reduce((a, b) => a + b, 0);
  const totalValue = data.reduce((sum, t) => sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

  const highestPrice = Math.max(...prices);
  const lowestPrice = Math.min(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Find the trades with highest and lowest prices
  const highestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === highestPrice);
  const lowestTrade = data.find(t => parseFloat(t.StockTradePrice || '0') === lowestPrice);

  const typeLabel = tradeType ? (tradeType.toLowerCase().startsWith('s') ? 'sell' : 'buy') : 'all';

  return {
    symbol: normalizedSymbol,
    year: filterYear,
    tradeType: typeLabel,
    tradesFound: data.length,
    totalShares,
    totalValue,
    highestPrice,
    highestPriceDate: highestTrade?.Date,
    highestPriceShares: highestTrade ? parseFloat(highestTrade.StockShareQty || '0') : 0,
    lowestPrice,
    lowestPriceDate: lowestTrade?.Date,
    lowestPriceShares: lowestTrade ? parseFloat(lowestTrade.StockShareQty || '0') : 0,
    averagePrice: avgPrice,
  };
}

// Tool: Get detailed trades
async function getDetailedTrades(symbol: string) {
  const normalizedSymbol = normalizeSymbol(symbol);

  const { data, error } = await supabase
    .from('TradeData')
    .select('*')
    .eq('AccountCode', ACCOUNT_CODE)
    .or(`Symbol.eq.${normalizedSymbol},UnderlyingSymbol.eq.${normalizedSymbol}`)
    .order('Date', { ascending: false });

  if (error) {
    return { error: error.message, symbol: normalizedSymbol };
  }

  // Calculate totals for stock trades
  const stockTrades = data?.filter(t => t.SecurityType === 'S') || [];
  const optionTrades = data?.filter(t => t.SecurityType === 'O') || [];
  const buyTrades = stockTrades.filter(t => t.TradeType === 'B');

  const totalSharesPurchased = buyTrades.reduce((sum, t) =>
    sum + parseFloat(t.StockShareQty || '0'), 0);
  const totalCost = buyTrades.reduce((sum, t) =>
    sum + Math.abs(parseFloat(t.NetAmount || '0')), 0);

  // Estimate current value using last trade price
  const lastPrice = stockTrades[0]?.StockTradePrice
    ? parseFloat(stockTrades[0].StockTradePrice)
    : 0;
  const currentValue = totalSharesPurchased * lastPrice;

  // Format trades for display
  const formattedStockTrades = stockTrades.map(t => ({
    tradeId: t.TradeID,
    date: t.Date,
    type: t.TradeType === 'B' ? 'Buy' : 'Sell',
    shares: parseFloat(t.StockShareQty || '0'),
    price: parseFloat(t.StockTradePrice || '0'),
    netAmount: parseFloat(t.NetAmount || '0'),
  }));

  const formattedOptionTrades = optionTrades.map(t => ({
    tradeId: t.TradeID,
    date: t.Date,
    type: t.TradeType === 'B' ? 'Buy' : 'Sell',
    callPut: t['Call/Put'] === 'C' ? 'Call' : 'Put',
    strike: parseFloat(t.Strike || '0'),
    expiration: t.Expiration,
    contracts: parseFloat(t.OptionContracts || '0'),
    premium: parseFloat(t.OptionTradePremium || '0'),
    netAmount: parseFloat(t.NetAmount || '0'),
  }));

  return {
    symbol: normalizedSymbol,
    summary: {
      totalSharesPurchased,
      totalCost,
      currentValue,
      lastTradePrice: lastPrice,
      profitLoss: currentValue - totalCost,
      profitLossPercent: totalCost > 0 ? ((currentValue - totalCost) / totalCost) * 100 : 0,
    },
    stockTrades: formattedStockTrades,
    optionTrades: formattedOptionTrades,
    stockTradeCount: stockTrades.length,
    optionTradeCount: optionTrades.length,
  };
}

// ElevenLabs webhook endpoint for tool calls
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ElevenLabs sends tool calls in this format
    const { tool_name, parameters } = body;

    console.log('ElevenLabs tool call:', { tool_name, parameters });

    let result;

    switch (tool_name) {
      case 'getTradeSummary':
      case 'get_trade_summary':
        result = await getTradeSummary(parameters.symbol);
        break;

      case 'getDetailedTrades':
      case 'get_detailed_trades':
        result = await getDetailedTrades(parameters.symbol);
        break;

      case 'getTradeStats':
      case 'get_trade_stats':
        result = await getTradeStats(
          parameters.symbol,
          parameters.trade_type || parameters.tradeType,
          parameters.year
        );
        break;

      default:
        return NextResponse.json(
          { error: `Unknown tool: ${tool_name}` },
          { status: 400 }
        );
    }

    // Format response for ElevenLabs
    // ElevenLabs expects a response that the agent can use
    let responseText = '';

    if (tool_name === 'getTradeSummary' || tool_name === 'get_trade_summary') {
      if ('error' in result && result.error) {
        responseText = `Error looking up trades: ${result.error}`;
      } else if ('totalTrades' in result) {
        responseText = `For ${result.symbol}: Found ${result.stockTrades} stock trades and ${result.optionTrades} option trades. Total: ${result.totalTrades} trades.`;
      }
    } else if (tool_name === 'getDetailedTrades' || tool_name === 'get_detailed_trades') {
      if ('error' in result && result.error) {
        responseText = `Error getting trade details: ${result.error}`;
      } else if ('summary' in result && result.summary) {
        const summary = result.summary;
        responseText = `Detailed ${result.symbol} trades:\n`;
        responseText += `- Total shares purchased: ${summary.totalSharesPurchased}\n`;
        responseText += `- Total cost: $${summary.totalCost.toFixed(2)}\n`;
        responseText += `- Current value: $${summary.currentValue.toFixed(2)}\n`;
        responseText += `- Profit/Loss: $${summary.profitLoss.toFixed(2)} (${summary.profitLossPercent.toFixed(2)}%)\n`;
        responseText += `- Stock trades: ${result.stockTradeCount}, Option trades: ${result.optionTradeCount}`;
      }
    } else if (tool_name === 'getTradeStats' || tool_name === 'get_trade_stats') {
      if ('error' in result && result.error) {
        responseText = `Error getting trade statistics: ${result.error}`;
      } else if ('message' in result && result.tradesFound === 0) {
        responseText = result.message as string;
      } else if ('highestPrice' in result && result.highestPrice !== undefined) {
        const typeLabel = result.tradeType === 'sell' ? 'sold' : result.tradeType === 'buy' ? 'bought' : 'traded';
        responseText = `${result.symbol} ${result.tradeType} trade statistics for ${result.year}:\n`;
        responseText += `- Highest price ${typeLabel}: $${result.highestPrice.toFixed(2)} on ${result.highestPriceDate} (${result.highestPriceShares} shares)\n`;
        responseText += `- Lowest price ${typeLabel}: $${(result.lowestPrice ?? 0).toFixed(2)} on ${result.lowestPriceDate} (${result.lowestPriceShares} shares)\n`;
        responseText += `- Average price: $${(result.averagePrice ?? 0).toFixed(2)}\n`;
        responseText += `- Total ${result.tradesFound} trades, ${result.totalShares} shares, $${(result.totalValue ?? 0).toFixed(2)} total value`;
      }
    }

    return NextResponse.json({
      response: responseText,
      data: result,
    });
  } catch (error) {
    console.error('ElevenLabs tool error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
