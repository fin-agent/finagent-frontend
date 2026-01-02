/**
 * Orders API Route
 *
 * Fetches orders from Alpaca Trading API
 */

import { NextRequest, NextResponse } from 'next/server';
import { listOrders, cancelOrder, type ListOrdersParams } from '@/src/services/alpacaTrading';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const params: ListOrdersParams = {
      status: (searchParams.get('status') as 'open' | 'closed' | 'all') || 'all',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      direction: (searchParams.get('direction') as 'asc' | 'desc') || 'desc',
    };

    if (searchParams.get('after')) params.after = searchParams.get('after')!;
    if (searchParams.get('until')) params.until = searchParams.get('until')!;
    if (searchParams.get('symbols')) params.symbols = searchParams.get('symbols')!.split(',');

    const orders = await listOrders(params);

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('[orders] Error fetching orders:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    await cancelOrder(orderId);

    return NextResponse.json({ success: true, message: `Order ${orderId} cancelled` });
  } catch (error) {
    console.error('[orders] Error cancelling order:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
