/**
 * Place Order Webhook
 *
 * Prepares a stock order and returns a confirmation request.
 * Does NOT execute the order - that's done by confirm-order.
 *
 * For sell orders:
 * - Checks current position via Alpaca API
 * - If selling more than long position: splits into sell long + sell short
 * - If no position: creates short sell order
 */

import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol, getCompanyName } from '@/src/lib/symbol-utils';
import { getLatestStockTrade, getMarketClock } from '@/src/services/alpacaMarketData';
import {
  getPosition,
  getAccount,
  determineOrderSide,
  parsePositionQty,
  formatOrderType,
  type OrderSide,
  type OrderType,
} from '@/src/services/alpacaTrading';
import { startTrace, formatTraceForResponse } from '@/src/lib/request-trace';

interface OrderConfirmationUIData {
  type: 'order-confirmation';
  symbol: string;
  companyName: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  limitPrice: number | null;
  currentPrice: number;
  estimatedTotal: number;
  currentPosition: {
    qty: number;
    side: 'long' | 'short';
    marketValue: number;
    avgEntryPrice: number;
  } | null;
  positionAction: 'close_long' | 'partial_sell' | 'short_sell' | 'split_order' | 'buy' | null;
  splitOrder: {
    longQty: number;
    shortQty: number;
  } | null;
  marketStatus: {
    isOpen: boolean;
    nextOpen: string;
    nextClose: string;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export async function POST(req: NextRequest) {
  const trace = startTrace('place-order');

  try {
    const body = await req.json();

    // Log request body keys for debugging
    console.log('📬 [place-order] Request body keys:', Object.keys(body));

    // Flexible parameter extraction (ElevenLabs may nest params differently)
    const rawSymbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const rawQuantity = body.quantity || body.parameters?.quantity || body.body?.quantity || body.body?.parameters?.quantity;
    const rawSide = body.side || body.parameters?.side || body.body?.side || body.body?.parameters?.side;
    const rawOrderType = body.order_type || body.parameters?.order_type || body.body?.order_type || body.body?.parameters?.order_type;
    const rawLimitPrice = body.limit_price || body.parameters?.limit_price || body.body?.limit_price || body.body?.parameters?.limit_price;
    const sellPosition = body.sell_position || body.parameters?.sell_position || body.body?.sell_position || body.body?.parameters?.sell_position;

    // Enhanced debug logging - capture full raw body for sell orders
    console.log('📊 [Place Order] Full params from ElevenLabs:', {
      symbol: rawSymbol,
      quantity: rawQuantity,
      side: rawSide,
      orderType: rawOrderType,
      limitPrice: rawLimitPrice,
      sellPosition,
      rawBodySnippet: JSON.stringify(body).substring(0, 800)
    });

    trace.logInput({ rawSymbol, rawQuantity, rawSide, rawOrderType, rawLimitPrice, sellPosition });

    // Validate required parameters
    if (!rawSymbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'Please specify a stock symbol. For example, "Buy 100 shares of Apple" or "Sell 50 shares of Tesla".',
        uiData: null,
      });
    }

    if (!rawSide || !['buy', 'sell'].includes(rawSide.toLowerCase())) {
      trace.logError('Invalid or missing side');
      return NextResponse.json({
        response: 'Please specify whether you want to buy or sell.',
        uiData: null,
      });
    }

    const side: OrderSide = rawSide.toLowerCase() as OrderSide;
    const isSellRequest = side === 'sell';

    // Normalize symbol
    const symbol = normalizeSymbol(rawSymbol);
    const companyName = getCompanyName(symbol);
    console.log(`📝 [${trace.traceId}] Resolved: ${symbol} (${companyName})`);

    // For buys, quantity is required
    // For sells with sell_position, we'll get quantity from position
    let quantity = rawQuantity ? Number(rawQuantity) : 0;

    if (!isSellRequest && (!quantity || quantity <= 0)) {
      trace.logError('Invalid quantity for buy order');
      return NextResponse.json({
        response: 'Please specify how many shares you want to buy. For example, "Buy 100 shares of Apple".',
        uiData: null,
      });
    }

    // Determine order type
    const orderType: OrderType = rawLimitPrice ? 'limit' : (rawOrderType?.toLowerCase() === 'limit' ? 'limit' : 'market');
    const limitPrice = rawLimitPrice ? Number(rawLimitPrice) : undefined;

    if (orderType === 'limit' && !limitPrice) {
      trace.logError('Limit order without price');
      return NextResponse.json({
        response: 'Please specify a price for the limit order. For example, "Buy 100 shares of Apple at 175".',
        uiData: null,
      });
    }

    // Fetch current market data and account info in parallel
    const [marketQuote, marketClock, position, account] = await Promise.all([
      getLatestStockTrade(symbol).catch(() => null),
      getMarketClock().catch(() => ({ isOpen: false, nextOpen: '', nextClose: '' })),
      isSellRequest ? getPosition(symbol).catch(() => null) : Promise.resolve(null),
      getAccount().catch(() => null),
    ]);

    const currentPrice = marketQuote?.price || 0;

    // Handle sell_position flag - sell entire position
    if (isSellRequest && sellPosition) {
      if (!position) {
        trace.logError(`No position found for ${symbol}`);
        return NextResponse.json({
          response: `You don't have a position in ${companyName} to sell.`,
          uiData: null,
        });
      }
      const posQty = parsePositionQty(position);
      if (posQty <= 0) {
        trace.logError(`Position is short or zero for ${symbol}`);
        return NextResponse.json({
          response: `You don't have a long position in ${companyName} to sell. Your current position is ${posQty < 0 ? `short ${Math.abs(posQty)}` : 'flat'}.`,
          uiData: null,
        });
      }
      quantity = posQty;
    }

    // For sells without quantity and without sell_position, ask for quantity
    if (isSellRequest && (!quantity || quantity <= 0)) {
      trace.logError('Invalid quantity for sell order');
      return NextResponse.json({
        response: `Please specify how many shares of ${companyName} you want to sell, or say "sell my position in ${companyName}" to sell all shares.`,
        uiData: null,
      });
    }

    // Determine order structure (for sells, may split into multiple orders)
    const orderInfo = determineOrderSide(position, quantity, isSellRequest);

    // Calculate estimated total
    const effectivePrice = limitPrice || currentPrice;
    const estimatedTotal = quantity * effectivePrice;

    // Check buying power for buy orders
    if (!isSellRequest && account) {
      const buyingPower = parseFloat(account.buying_power);
      if (estimatedTotal > buyingPower) {
        trace.logError(`Insufficient buying power: need ${estimatedTotal}, have ${buyingPower}`);
        return NextResponse.json({
          response: `You don't have enough buying power for this order. The estimated cost is ${formatCurrency(estimatedTotal)}, but your available buying power is ${formatCurrency(buyingPower)}.`,
          uiData: null,
        });
      }
    }

    // Build position info for UI
    const positionInfo = position ? {
      qty: parsePositionQty(position),
      side: position.side,
      marketValue: parseFloat(position.market_value),
      avgEntryPrice: parseFloat(position.avg_entry_price),
    } : null;

    // Build split order info for UI
    const splitOrderInfo = orderInfo.positionAction === 'split_order' ? {
      longQty: orderInfo.orders[0].qty,
      shortQty: orderInfo.orders[1].qty,
    } : null;

    // Build UI data
    const uiData: OrderConfirmationUIData = {
      type: 'order-confirmation',
      symbol,
      companyName,
      side,
      quantity,
      orderType,
      limitPrice: limitPrice || null,
      currentPrice,
      estimatedTotal,
      currentPosition: positionInfo,
      positionAction: orderInfo.positionAction,
      splitOrder: splitOrderInfo,
      marketStatus: {
        isOpen: marketClock.isOpen,
        nextOpen: marketClock.nextOpen,
        nextClose: marketClock.nextClose,
      },
    };

    // Build voice response
    let voiceResponse: string;
    const orderTypeStr = formatOrderType(orderType, limitPrice);

    if (isSellRequest) {
      // Sell order voice response
      if (orderInfo.positionAction === 'split_order' && splitOrderInfo) {
        // Split order
        if (orderType === 'limit') {
          voiceResponse = `Placing Limit order to sell long ${splitOrderInfo.longQty} shares of ${companyName} at ${formatCurrency(limitPrice!)} and placing order to sell short ${splitOrderInfo.shortQty} shares of ${companyName} at ${formatCurrency(limitPrice!)}. Is this correct?`;
        } else {
          voiceResponse = `Placing Market order to sell long ${splitOrderInfo.longQty} shares of ${companyName} and placing order to sell short ${splitOrderInfo.shortQty} shares of ${companyName}. Is this correct?`;
        }
      } else if (orderInfo.positionAction === 'short_sell') {
        // Short sell
        if (orderType === 'limit') {
          voiceResponse = `Placing Limit order to sell short ${quantity} shares of ${companyName} at ${formatCurrency(limitPrice!)}. Is this correct?`;
        } else {
          voiceResponse = `Placing Market order to sell short ${quantity} shares of ${companyName}. Is this correct?`;
        }
      } else {
        // Regular sell (closing long or partial)
        if (orderType === 'limit') {
          voiceResponse = `Placing Limit order to sell long ${quantity} shares of ${companyName} at ${formatCurrency(limitPrice!)}. Is this correct?`;
        } else {
          voiceResponse = `Placing Market order to sell long ${quantity} shares of ${companyName}. Is this correct?`;
        }
      }

      // Add position context for sell_position
      if (sellPosition && positionInfo) {
        voiceResponse = `You currently have a position of ${positionInfo.qty} shares long of ${companyName}. ${voiceResponse}`;
      }
    } else {
      // Buy order voice response
      if (orderType === 'limit') {
        voiceResponse = `Placing Limit order to buy ${quantity} shares of ${companyName} at a price of ${formatCurrency(limitPrice!)}. Is this correct?`;
      } else {
        voiceResponse = `Placing Market order to buy ${quantity} shares of ${companyName}. Is this correct?`;
      }
    }

    // Add market status warning if closed
    if (!marketClock.isOpen) {
      voiceResponse += ' Note: The market is currently closed, so this order will be queued for the next trading session.';
    }

    trace.logResponse({
      voiceText: voiceResponse,
      uiDataSummary: `${side} ${quantity} ${symbol} @ ${orderTypeStr}`,
    }, 'passed');

    const completedTrace = trace.complete();

    return NextResponse.json({
      response: voiceResponse,
      uiData,
      _debug: formatTraceForResponse(completedTrace),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    trace.logError(`Order preparation failed: ${errorMessage}`);
    const completedTrace = trace.complete();

    console.error('[place-order] Error:', error);

    return NextResponse.json({
      response: 'Sorry, I encountered an error preparing your order. Please try again.',
      uiData: null,
      _debug: formatTraceForResponse(completedTrace),
    });
  }
}
