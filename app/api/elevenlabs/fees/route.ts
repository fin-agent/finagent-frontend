import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeSymbol, parseOptionSymbol } from '@/src/lib/symbol-utils';
import { suggestDataPeriod } from '@/src/lib/data-availability';
import { formatDateForDB } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import { checkSymbolPresence } from '@/src/lib/symbol-lookup';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee' | 'short_interest';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

// UI data structure for FeesSummary component
interface FeesUIData {
  feeType: FeeType;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  symbol?: string;
  breakdown?: Array<{
    date: string;
    amount: number;
    symbol?: string;
  }>;
  suggestion?: {
    period: string;
    amount: number;
    count: number;
    startDate: string;
    endDate: string;
  } | null;
}

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
                       body.body?.time_period || body.body?.parameters?.time_period || 'this year';
    const symbol = body.symbol || body.parameters?.symbol ||
                   body.body?.symbol || body.body?.parameters?.symbol;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter;

    if (!feeType) {
      return NextResponse.json({
        response: 'Please specify what type of fee you want to look up: commissions, credit interest, debit interest, or locate fees.',
      });
    }

    // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string;
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // Use LLM-resolved dates directly
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realStart);
      endDate = formatDateForDB(realEnd);
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: ${dateFilter.startDate} to ${dateFilter.endDate} -> ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
      // LLM provided discrete dates - use directly
      dates = dateFilter.dates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        const date = new Date(y, m - 1, day);
        return formatDateForDB(date);
      });
      startDate = dates[0];
      endDate = dates[dates.length - 1];
      description = dateFilter.description || timePeriod || 'selected dates';
      resolvedType = 'discrete';
      console.log(`Using LLM discrete dates: ${dateFilter.dates.join(', ')} -> demo ${dates.join(', ')} (${description})`);
    } else if (timePeriod) {
      // Fall back to parsing timePeriod string when dateFilter not provided
      const resolved = parseTimePeriodToResolvedDates(timePeriod);
      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates) {
          dates = resolved.dates;
          startDate = dates[0];
          endDate = dates[dates.length - 1];
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
    } else {
      // No timePeriod and no dateFilter - use default description
      description = 'this year';
      console.log('No dateFilter or timePeriod provided, querying all data');
    }

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      let query = supabase
        .from('TradeData')
        .select('Commission, Date, Symbol')
        .eq('AccountCode', ACCOUNT_CODE);

      if (resolvedType === 'discrete' && dates && dates.length > 0) {
        query = query.in('Date', dates);
      } else if (startDate && endDate) {
        query = query.gte('Date', startDate).lte('Date', endDate);
      }

      const { data, error } = await query.order('Date', { ascending: false });

      if (error) {
        const uiData: FeesUIData = {
          feeType: 'commission',
          totalAmount: 0,
          transactionCount: 0,
          timePeriod: description,
        };
        return NextResponse.json({
          response: `Error retrieving commission data: ${error.message}`,
          uiData,
        });
      }

      const totalCommission = data ? data.reduce((sum, trade) => sum + Math.abs(trade.Commission || 0), 0) : 0;

      // Suggest alternatives if no data OR if total commission is effectively zero
      if (!data || data.length === 0 || Math.abs(totalCommission) < 0.01) {
        // Use LLM-based suggestion for a natural time period with actual amount
        const suggestion = await suggestDataPeriod('TradeData', description);
        if (suggestion && suggestion.amount > 0) {
          const uiData: FeesUIData = {
            feeType: 'commission',
            totalAmount: 0,
            transactionCount: 0,
            timePeriod: description,
            suggestion: {
              period: suggestion.suggestedPeriod,
              amount: suggestion.amount,
              count: suggestion.count,
              startDate: suggestion.startDate,
              endDate: suggestion.endDate,
            },
          };
          return NextResponse.json({
            response: `No commission data found for ${description}. However, I found ${formatCurrency(suggestion.amount)} in commissions for ${suggestion.suggestedPeriod}. Would you like to know more about that?`,
            uiData,
          });
        }

        const uiData: FeesUIData = {
          feeType: 'commission',
          totalAmount: 0,
          transactionCount: 0,
          timePeriod: description,
        };
        return NextResponse.json({
          response: `No commission data found for ${description}.`,
          uiData,
        });
      }

      const amount = formatCurrency(Math.abs(totalCommission));
      const uiData: FeesUIData = {
        feeType: 'commission',
        totalAmount: Math.abs(totalCommission),
        transactionCount: data.length,
        timePeriod: description,
        breakdown: data.slice(0, 10).map(t => ({
          date: t.Date,
          amount: Math.abs(t.Commission || 0),
          symbol: parseOptionSymbol(t.Symbol),
        })),
      };
      return NextResponse.json({
        response: `The total commission you paid in ${description} is ${amount}`,
        uiData,
      });
    }

    // Handle other fee types from FeesAndInterest table
    const feeTypeMap: Record<string, string> = {
      'credit_interest': 'CreditInt',
      'debit_interest': 'DebitInt',
      'locate_fee': 'LocateFee',
      'short_interest': 'LocateFee', // Short interest = locate/borrow fees for short positions
    };

    const dbFeeType = feeTypeMap[feeType];

    let feesQuery = supabase
      .from('FeesAndInterest')
      .select('*')
      .eq('Type', dbFeeType);

    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      feesQuery = feesQuery.in('Date', dates);
    } else if (startDate && endDate) {
      feesQuery = feesQuery.gte('Date', startDate).lte('Date', endDate);
    }

    // For locate fees / short interest, filter by symbol if provided
    if ((feeType === 'locate_fee' || feeType === 'short_interest') && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      feesQuery = feesQuery.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await feesQuery.order('Date', { ascending: false });

    const normalizedSymbol = symbol ? normalizeSymbol(symbol) : undefined;

    if (error) {
      const uiData: FeesUIData = {
        feeType,
        totalAmount: 0,
        transactionCount: 0,
        timePeriod: description,
        symbol: normalizedSymbol,
      };
      return NextResponse.json({
        response: `Error retrieving fee data: ${error.message}`,
        uiData,
      });
    }

    const totalAmount = data ? data.reduce((sum, fee) => sum + Math.abs(fee.Amount || 0), 0) : 0;

    // Suggest alternatives if no data OR if total amount is effectively zero
    if (!data || data.length === 0 || Math.abs(totalAmount) < 0.01) {
      // Use LLM-based suggestion for a natural time period with actual amount
      const suggestion = await suggestDataPeriod('FeesAndInterest', description, {
        feeType: dbFeeType,
        symbol: normalizedSymbol,
      });

      const feeTypeName = feeType.replace('_', ' ');
      const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';

      // Check if symbol exists elsewhere (e.g., in trades)
      let symbolContext: string | undefined;
      if (normalizedSymbol) {
        const presence = await checkSymbolPresence(normalizedSymbol, 'FeesAndInterest');
        if (presence.context) {
          symbolContext = presence.context;
        }
      }

      if (suggestion && suggestion.amount > 0) {
        const uiData: FeesUIData = {
          feeType,
          totalAmount: 0,
          transactionCount: 0,
          timePeriod: description,
          symbol: normalizedSymbol,
          suggestion: {
            period: suggestion.suggestedPeriod,
            amount: suggestion.amount,
            count: suggestion.count,
            startDate: suggestion.startDate,
            endDate: suggestion.endDate,
          },
        };
        return NextResponse.json({
          response: `No ${feeTypeName} found${symbolText} for ${description}. However, I found ${formatCurrency(suggestion.amount)} in ${feeTypeName} for ${suggestion.suggestedPeriod}. Would you like to know more about that?`,
          uiData,
        });
      }

      // If no suggestion but symbol has trades, mention that
      let responseText = `No ${feeTypeName} data found${symbolText} for ${description}.`;
      if (symbolContext) {
        const contextLower = symbolContext.charAt(0).toLowerCase() + symbolContext.slice(1);
        responseText += ` However, ${contextLower} Would you like to see those instead?`;
      }

      const uiData: FeesUIData = {
        feeType,
        totalAmount: 0,
        transactionCount: 0,
        timePeriod: description,
        symbol: normalizedSymbol,
      };
      return NextResponse.json({
        response: responseText,
        uiData,
      });
    }

    // Build response based on fee type - include transaction count
    const txCount = data.length;
    const txCountText = txCount > 1 ? ` across ${txCount} transactions` : '';

    let response = '';
    switch (feeType) {
      case 'credit_interest':
        response = `The total credit interest you received for ${description} is ${formatCurrency(Math.abs(totalAmount))}${txCountText}`;
        break;
      case 'debit_interest':
        response = `The total Debit interest you paid for ${description} is ${formatCurrency(Math.abs(totalAmount))}${txCountText}`;
        break;
      case 'locate_fee': {
        const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
        response = `The total Locate fees you paid${symbolText} for ${description} is ${formatCurrency(Math.abs(totalAmount))}${txCountText}`;
        break;
      }
      case 'short_interest': {
        const symbolText = normalizedSymbol ? ` for ${normalizedSymbol}` : '';
        response = `Your total short interest${symbolText} for ${description} is ${formatCurrency(Math.abs(totalAmount))}${txCountText}`;
        break;
      }
    }

    // Add breakdown summary for large transaction counts
    if (txCount > 3) {
      const topTransactions = data.slice(0, 3).map(f => {
        const date = new Date(f.Date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
        return `${formatCurrency(Math.abs(f.Amount || 0))} on ${date}`;
      });
      response += `. The most recent charges were ${topTransactions.join(', ')}`;
    }

    // Build UI data with breakdown
    const uiData: FeesUIData = {
      feeType,
      totalAmount: Math.abs(totalAmount),
      transactionCount: data.length,
      timePeriod: description,
      symbol: normalizedSymbol,
      breakdown: data.slice(0, 10).map(f => ({
        date: f.Date,
        amount: Math.abs(f.Amount || 0),
        symbol: f.Symbol ? parseOptionSymbol(f.Symbol) : undefined,
      })),
    };

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error('Fees error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your fee information.',
    });
  }
}
