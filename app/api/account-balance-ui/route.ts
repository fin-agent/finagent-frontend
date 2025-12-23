import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { parseTimePeriodToResolvedDates, type ResolvedDates } from '@/src/lib/date-parser';
import { checkDataAvailability } from '@/src/lib/data-availability';
import type { DateFilter } from '@/src/lib/intent-detection/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

export interface AccountBalanceUIData {
  queryType: string;
  date: string;
  cashBalance?: number;
  accountEquity?: number;
  dayTradingBP?: number;
  stockLMV?: number;
  stockSMV?: number;
  optionsLMV?: number;
  optionsSMV?: number;
  creditBalance?: number;
  debitBalance?: number;
  houseRequirement?: number;
  houseExcessDeficit?: number;
  fedRequirement?: number;
  fedExcessDeficit?: number;
  // For balance trends
  balanceTrend?: {
    average: number;
    highest: number;
    highestDate: string;
    lowest: number;
    lowestDate: string;
    period: string;
    periodMonth?: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const queryType = body.queryType || 'account_summary';
    const { timePeriod, dateFilter } = body;

    // IMPORTANT: Always use parseTimePeriodToResolvedDates to match voice endpoint
    // This prevents voice/UI drift where voice says one amount but UI shows different
    let resolved: ResolvedDates | null = null;

    // For dateFilter with explicit startDate/endDate (e.g., from suggestion follow-up),
    // use those dates DIRECTLY without applying offset again.
    // These dates come from suggestDataPeriod() which already returns demo-adjusted dates.
    // If we call resolveDateFilter(), it applies the offset AGAIN causing voice/UI drift.
    if (dateFilter && (dateFilter as DateFilter).startDate && (dateFilter as DateFilter).endDate) {
      const df = dateFilter as DateFilter;
      resolved = {
        type: df.type === 'discrete' ? 'discrete' : 'range',
        startDate: df.startDate,
        endDate: df.endDate,
        description: df.description || timePeriod || 'selected period',
      };
    } else if (timePeriod) {
      // Primary path: parse time period string (matches voice endpoint)
      resolved = parseTimePeriodToResolvedDates(timePeriod);
    } else if (dateFilter && (dateFilter as DateFilter).period) {
      // Fallback: if only period provided in dateFilter, parse it
      resolved = parseTimePeriodToResolvedDates((dateFilter as DateFilter).period!);
    }

    // For balance trends
    if (queryType === 'debit_balances' || queryType === 'credit_balances') {
      const resolvedPeriodLabel = resolved?.description || timePeriod || 'available period';
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      if (resolved) {
        if (resolved.type === 'discrete' && resolved.dates && resolved.dates.length > 0) {
          query = query.in('Date', resolved.dates);
        } else if (resolved.startDate && resolved.endDate) {
          query = query.gte('Date', resolved.startDate).lte('Date', resolved.endDate);
        }
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        const { suggestion, availableRange } = resolved
          ? await checkDataAvailability('AccountBalance', resolved)
          : { suggestion: null, availableRange: { hasData: false, earliestDate: '', latestDate: '' } };
        return NextResponse.json({
          queryType,
          date: '',
          balanceTrend: null,
          suggestion,
          availableRange: availableRange.hasData ? {
            earliestDate: availableRange.earliestDate,
            latestDate: availableRange.latestDate,
          } : null,
        });
      }

      const balanceField = queryType === 'debit_balances' ? 'DebitBalance' : 'CreditBalance';
      const values = data.map(d => d[balanceField] || 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const maxDate = data.find(d => d[balanceField] === max)?.Date || '';
      const minDate = data.find(d => d[balanceField] === min)?.Date || '';
      const entries = data
        .slice()
        .reverse()
        .map((row) => ({ date: row.Date, amount: row[balanceField] || 0 }));

      return NextResponse.json({
        queryType,
        date: data[0].Date, // Return raw date - component will format it
        balanceTrend: {
          average: avg,
          highest: max,
          highestDate: maxDate, // Return raw date
          lowest: min,
          lowestDate: minDate, // Return raw date
          period: resolvedPeriodLabel,
          entries,
        },
      });
    }

    // Get latest record for other queries
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'No data found' });
    }

    const result: AccountBalanceUIData = {
      queryType,
      date: data.Date, // Return raw date - component will format it
      cashBalance: data.CashBalance,
      accountEquity: data['Account Equity'],
      dayTradingBP: data.DayTradingBP,
      stockLMV: data['Stock LMV'],
      stockSMV: data['Stock SMV'],
      optionsLMV: data['Options LMV'],
      optionsSMV: data['Optons SMV'], // DB typo
      creditBalance: data.CreditBalance,
      debitBalance: data.DebitBalance,
      houseRequirement: data.HouseRequirment, // DB typo
      houseExcessDeficit: data.HouseExcessDeficit,
      fedRequirement: data.FedRequirement,
      fedExcessDeficit: data.FedExcessDeficit,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Account balance UI error:', error);
    return NextResponse.json({ error: 'Internal server error' });
  }
}
