import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { resolveDateFilter, parseTimePeriodToResolvedDates, type ResolvedDates } from '@/src/lib/date-parser';
import { normalizeSymbol, parseOptionSymbol } from '@/src/lib/symbol-utils';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import type { DateFilter } from '@/src/lib/intent-detection/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface FeesUIData {
  feeType: string;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  periodMonth?: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feeType = body.feeType || 'commission';
    const { timePeriod, dateFilter, symbol } = body;

    if (!timePeriod && !dateFilter) {
      return NextResponse.json({ error: 'Time period is required' }, { status: 400 });
    }

    // Resolve dates: prefer dateFilter from LLM, fallback to regex parsing
    let resolved: ResolvedDates | null = null;

    if (dateFilter) {
      resolved = resolveDateFilter(dateFilter as DateFilter);
    } else if (timePeriod) {
      resolved = parseTimePeriodToResolvedDates(timePeriod);
    }

    if (!resolved) {
      return NextResponse.json({ error: 'Invalid time period' }, { status: 400 });
    }

    const { startDate, endDate, dates, description } = resolved;

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      let query = supabase
        .from('TradeData')
        .select('Commission, Date, Symbol')
        .eq('AccountCode', ACCOUNT_CODE);

      if (resolved.type === 'discrete' && dates && dates.length > 0) {
        query = query.in('Date', dates);
      } else if (startDate && endDate) {
        query = query.gte('Date', startDate).lte('Date', endDate);
      }

      const { data, error } = await query.order('Date', { ascending: false });

      const totalAmount = data ? data.reduce((sum, trade) => sum + Math.abs(trade.Commission || 0), 0) : 0;

      // Check for no data OR zero total amount
      if (error || !data || data.length === 0 || totalAmount < 0.01) {
        const suggestion = await suggestDataPeriod('TradeData', description);
        return NextResponse.json({
          feeType,
          totalAmount: 0,
          transactionCount: 0,
          timePeriod: description,
          breakdown: [],
          suggestion: suggestion ? {
            period: suggestion.suggestedPeriod,
            amount: suggestion.amount,
            count: suggestion.count,
            startDate: suggestion.startDate,
            endDate: suggestion.endDate,
          } : null,
        });
      }

      return NextResponse.json({
        feeType,
        totalAmount,
        transactionCount: data.length,
        timePeriod: description,
        breakdown: data.slice(0, 10).map(t => ({
          date: t.Date,
          amount: Math.abs(t.Commission || 0),
          symbol: parseOptionSymbol(t.Symbol),
        })),
      });
    }

    // Handle other fee types from FeesAndInterest table
    const feeTypeMap: Record<string, string> = {
      'credit_interest': 'CreditInt',
      'debit_interest': 'DebitInt',
      'locate_fee': 'LocateFee',
    };

    const dbFeeType = feeTypeMap[feeType];

    let feesQuery = supabase
      .from('FeesAndInterest')
      .select('*')
      .eq('Type', dbFeeType);

    if (resolved.type === 'discrete' && dates && dates.length > 0) {
      feesQuery = feesQuery.in('Date', dates);
    } else if (startDate && endDate) {
      feesQuery = feesQuery.gte('Date', startDate).lte('Date', endDate);
    }

    if (feeType === 'locate_fee' && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      feesQuery = feesQuery.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await feesQuery.order('Date', { ascending: false });

    const totalAmount = data ? data.reduce((sum, fee) => sum + Math.abs(fee.Amount || 0), 0) : 0;

    // Check for no data OR zero total amount
    if (error || !data || data.length === 0 || totalAmount < 0.01) {
      const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;
      const suggestion = await suggestDataPeriod('FeesAndInterest', description, {
        feeType: dbFeeType,
        symbol: normalizedSymbol,
      });
      return NextResponse.json({
        feeType,
        totalAmount: 0,
        transactionCount: 0,
        timePeriod: description,
        symbol: normalizedSymbol,
        breakdown: [],
        suggestion: suggestion ? {
          period: suggestion.suggestedPeriod,
          amount: suggestion.amount,
          count: suggestion.count,
          startDate: suggestion.startDate,
          endDate: suggestion.endDate,
        } : null,
      });
    }

    return NextResponse.json({
      feeType,
      totalAmount,
      transactionCount: data.length,
      timePeriod: description,
      symbol: symbol ? normalizeSymbol(symbol) : undefined,
      breakdown: data.slice(0, 10).map(f => ({
        date: f.Date,
        amount: Math.abs(f.Amount || 0),
        symbol: parseOptionSymbol(f.Symbol),
      })),
    });
  } catch (error) {
    console.error('Fees UI error:', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
