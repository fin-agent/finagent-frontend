import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { normalizeSymbol } from '@/src/lib/symbol-utils';
import { checkDataAvailability } from '@/src/lib/data-availability';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Fees request body:', JSON.stringify(body, null, 2));

    // Extract parameters from various possible locations
    const feeType: FeeType = body.fee_type || body.parameters?.fee_type ||
                             body.body?.fee_type || body.body?.parameters?.fee_type;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period || 'this month';
    const symbol = body.symbol || body.parameters?.symbol ||
                   body.body?.symbol || body.body?.parameters?.symbol;

    if (!feeType) {
      return NextResponse.json({
        response: 'Please specify what type of fee you want to look up: commissions, credit interest, debit interest, or locate fees.',
      });
    }

    // Resolve dates using centralized parser
    const resolved = parseTimePeriodToResolvedDates(timePeriod);
    if (!resolved) {
      return NextResponse.json({
        response: `I couldn't understand the time period "${timePeriod}". Please try something like "last month", "this year", or "June 1st to the 7th".`,
      });
    }

    const { startDate, endDate, dates, description } = resolved;

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      let query = supabase
        .from('TradeData')
        .select('Commission, Date')
        .eq('AccountCode', ACCOUNT_CODE);

      if (resolved.type === 'discrete' && dates && dates.length > 0) {
        query = query.in('Date', dates);
      } else if (startDate && endDate) {
        query = query.gte('Date', startDate).lte('Date', endDate);
      }

      const { data, error } = await query;

      if (error) {
        return NextResponse.json({
          response: `Error retrieving commission data: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        // Check data availability to provide helpful suggestion
        const { availableRange } = await checkDataAvailability('TradeData', resolved);
        const suggestionText = availableRange.hasData
          ? ` Data is available from ${new Date(availableRange.earliestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${new Date(availableRange.latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Would you like to try a different time period?`
          : '';

        return NextResponse.json({
          response: `No commission data found for ${description}.${suggestionText}`,
        });
      }

      const totalCommission = data.reduce((sum, trade) => sum + (trade.Commission || 0), 0);
      const amount = formatCurrency(Math.abs(totalCommission));
      return NextResponse.json({
        response: `The total commission you paid for ${description} is ${amount}`,
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

    // For locate fees, filter by symbol if provided
    if (feeType === 'locate_fee' && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      feesQuery = feesQuery.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await feesQuery;

    if (error) {
      return NextResponse.json({
        response: `Error retrieving fee data: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      // Check data availability to provide helpful suggestion
      const { availableRange } = await checkDataAvailability('FeesAndInterest', resolved);
      const suggestionText = availableRange.hasData
        ? ` Data is available from ${new Date(availableRange.earliestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} to ${new Date(availableRange.latestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Would you like to try a different time period?`
        : '';
      const symbolText = symbol ? ` for ${normalizeSymbol(symbol)}` : '';

      return NextResponse.json({
        response: `No ${feeType.replace('_', ' ')} data found${symbolText} for ${description}.${suggestionText}`,
      });
    }

    const totalAmount = data.reduce((sum, fee) => sum + (fee.Amount || 0), 0);

    // Build response based on fee type
    let response = '';
    switch (feeType) {
      case 'credit_interest':
        response = `The total credit interest you received for ${description} is ${formatCurrency(Math.abs(totalAmount))}`;
        break;
      case 'debit_interest':
        response = `The total debit interest you paid for ${description} is ${formatCurrency(Math.abs(totalAmount))}`;
        break;
      case 'locate_fee': {
        const symbolText = symbol ? ` for stock ${normalizeSymbol(symbol)}` : '';
        response = `The total locate fees you paid${symbolText} for ${description} is ${formatCurrency(Math.abs(totalAmount))}`;
        break;
      }
    }

    return NextResponse.json({ response });

  } catch (error) {
    console.error('Fees error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your fee information.',
    });
  }
}
