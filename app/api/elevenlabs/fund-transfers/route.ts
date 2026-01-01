import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { formatDateForDB } from '@/src/lib/date-utils';
import { parseTimePeriodToResolvedDates } from '@/src/lib/date-parser';
import {
  parseTimePeriodWithRecovery,
  handleQueryError,
} from '@/src/lib/error-recovery';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type TransferType = 'all' | 'wire' | 'ach' | 'journal';
type DirectionType = 'all' | 'in' | 'out';

// LLM-resolved date filter
interface DateFilter {
  type: 'range' | 'discrete' | 'relative';
  startDate?: string;
  endDate?: string;
  dates?: string[];
  description: string;
}

// UI data structure for FundTransfersCard component
interface FundTransfersUIData {
  transferType: TransferType;
  direction: DirectionType;
  totalAmount: number;
  transactionCount: number;
  timePeriod: string;
  totalIn: number;
  totalOut: number;
  countIn: number;
  countOut: number;
  transfers?: Array<{
    date: string;
    type: string;
    direction: 'in' | 'out';
    amount: number;
    transNumber: string;
  }>;
  suggestion?: {
    period: string;
    amount: number;
    count: number;
    startDate: string;
    endDate: string;
  } | null;
  // For specific amount queries like "Which day did I withdraw 1000"
  searchedAmount?: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

// Map transfer type to DB value
function mapTransferType(type: TransferType): string | null {
  const typeMap: Record<string, string> = {
    'wire': 'WIRE',
    'ach': 'ACH',
    'journal': 'JNL',
  };
  return typeMap[type] || null;
}

// Get human-readable transfer type name
function getTransferTypeName(type: TransferType): string {
  const names: Record<TransferType, string> = {
    'all': 'fund transfers',
    'wire': 'wire transfers',
    'ach': 'ACH transfers',
    'journal': 'journal entries',
  };
  return names[type];
}

// Get direction description
function getDirectionDescription(direction: DirectionType): string {
  const descriptions: Record<DirectionType, string> = {
    'all': '',
    'in': 'into your account',
    'out': 'out of your account',
  };
  return descriptions[direction];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Fund transfers request body:', JSON.stringify(body, null, 2));

    // Extract parameters from various possible locations
    const transferType: TransferType = body.transfer_type || body.parameters?.transfer_type ||
                             body.body?.transfer_type || body.body?.parameters?.transfer_type || 'all';
    const direction: DirectionType = body.direction || body.parameters?.direction ||
                             body.body?.direction || body.body?.parameters?.direction || 'all';
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period || 'this year';
    const amount = body.amount || body.parameters?.amount ||
                   body.body?.amount || body.body?.parameters?.amount;
    const dateFilter: DateFilter | undefined = body.date_filter || body.parameters?.date_filter;

    // Recovery Type B: Validate and correct time period if needed
    let correctedTimePeriod = timePeriod;
    if (timePeriod && !dateFilter) {
      const recovery = parseTimePeriodWithRecovery(timePeriod);
      if (!recovery.parsed && recovery.suggestion) {
        console.log(`[fund-transfers] Invalid time period: ${timePeriod}`);
        return NextResponse.json({
          response: recovery.suggestion,
        });
      }
      if (recovery.correctedPeriod) {
        correctedTimePeriod = recovery.correctedPeriod;
        console.log(`[fund-transfers] Corrected time period: "${timePeriod}" -> "${correctedTimePeriod}"`);
      }
    }

    // Resolve dates - prioritize LLM-resolved dateFilter, fall back to parsing timePeriod
    let startDate: string | undefined;
    let endDate: string | undefined;
    let dates: string[] | undefined;
    let description: string;
    let resolvedType: 'range' | 'discrete' = 'range';

    if (dateFilter && dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      const [sy, sm, sd] = dateFilter.startDate.split('-').map(Number);
      const [ey, em, ed] = dateFilter.endDate.split('-').map(Number);
      const realStart = new Date(sy, sm - 1, sd);
      const realEnd = new Date(ey, em - 1, ed);
      startDate = formatDateForDB(realStart);
      endDate = formatDateForDB(realEnd);
      description = dateFilter.description || timePeriod || 'selected period';
      console.log(`Using LLM dateFilter: ${dateFilter.startDate} to ${dateFilter.endDate} -> ${startDate} to ${endDate} (${description})`);
    } else if (dateFilter && dateFilter.type === 'discrete' && dateFilter.dates && dateFilter.dates.length > 0) {
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
    } else if (correctedTimePeriod) {
      const resolved = parseTimePeriodToResolvedDates(correctedTimePeriod);
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
        description = resolved.description || correctedTimePeriod;
        console.log(`Parsed timePeriod "${correctedTimePeriod}": ${resolved.type}, dates: ${dates || `${startDate} to ${endDate}`}`);
      } else {
        description = correctedTimePeriod;
        console.log(`Could not parse timePeriod "${correctedTimePeriod}", querying all data`);
      }
    } else {
      description = 'this year';
      console.log('No dateFilter or timePeriod provided, querying all data');
    }

    // Build query
    let query = supabase
      .from('AccountFundTransfers')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    // Filter by transfer type
    const dbType = mapTransferType(transferType);
    if (dbType) {
      query = query.eq('Type', dbType);
    }

    // Filter by direction (CR = in, DR = out)
    if (direction === 'in') {
      query = query.eq('CrDr', 'CR');
    } else if (direction === 'out') {
      query = query.eq('CrDr', 'DR');
    }

    // Filter by specific amount if provided
    if (amount) {
      query = query.eq('Amount', amount);
    }

    // Filter by date
    if (resolvedType === 'discrete' && dates && dates.length > 0) {
      query = query.in('Date', dates);
    } else if (startDate && endDate) {
      query = query.gte('Date', startDate).lte('Date', endDate);
    }

    const { data, error } = await query.order('Date', { ascending: false });

    if (error) {
      console.error('[fund-transfers] Database error:', error);
      const uiData: FundTransfersUIData = {
        transferType,
        direction,
        totalAmount: 0,
        transactionCount: 0,
        timePeriod: description,
        totalIn: 0,
        totalOut: 0,
        countIn: 0,
        countOut: 0,
      };
      return NextResponse.json({
        response: `Error retrieving fund transfer data: ${error.message}`,
        uiData,
      });
    }

    // Calculate totals
    const totalIn = data ? data.filter(t => t.CrDr === 'CR').reduce((sum, t) => sum + (t.Amount || 0), 0) : 0;
    const totalOut = data ? data.filter(t => t.CrDr === 'DR').reduce((sum, t) => sum + (t.Amount || 0), 0) : 0;
    const countIn = data ? data.filter(t => t.CrDr === 'CR').length : 0;
    const countOut = data ? data.filter(t => t.CrDr === 'DR').length : 0;
    const totalAmount = direction === 'in' ? totalIn : direction === 'out' ? totalOut : totalIn + totalOut;
    const transactionCount = data?.length || 0;

    // No data found
    if (!data || data.length === 0) {
      const transferTypeName = getTransferTypeName(transferType);
      const directionDesc = getDirectionDescription(direction);

      const uiData: FundTransfersUIData = {
        transferType,
        direction,
        totalAmount: 0,
        transactionCount: 0,
        timePeriod: description,
        totalIn: 0,
        totalOut: 0,
        countIn: 0,
        countOut: 0,
      };

      // If searching for specific amount
      if (amount) {
        return NextResponse.json({
          response: `No ${transferTypeName} of ${formatCurrency(amount)} found ${directionDesc} for ${description}.`,
          uiData,
        });
      }

      return NextResponse.json({
        response: `No ${transferTypeName} found ${directionDesc} for ${description}.`,
        uiData,
      });
    }

    // Build response based on query type
    const transferTypeName = getTransferTypeName(transferType);
    let response = '';

    // Searching for specific amount - return when
    if (amount) {
      const matchingTransfer = data[0];
      const date = new Date(matchingTransfer.Date).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      const transferDir = matchingTransfer.CrDr === 'CR' ? 'deposited' : 'withdrew';
      response = `You ${transferDir} ${formatCurrency(amount)} on ${date} via ${matchingTransfer.Type}.`;
    }
    // Direction-specific query
    else if (direction === 'in') {
      response = `You brought ${formatCurrency(totalIn)} into your account for ${description} across ${countIn} ${transferTypeName}.`;
      if (data.length <= 5) {
        const breakdown = data.map(t => {
          const date = new Date(t.Date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
          return `${formatCurrency(t.Amount)} via ${t.Type} on ${date}`;
        });
        response += ` That includes ${breakdown.join(', ')}.`;
      }
    } else if (direction === 'out') {
      response = `You withdrew ${formatCurrency(totalOut)} from your account for ${description} across ${countOut} ${transferTypeName}.`;
      if (data.length <= 5) {
        const breakdown = data.map(t => {
          const date = new Date(t.Date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
          return `${formatCurrency(t.Amount)} via ${t.Type} on ${date}`;
        });
        response += ` That includes ${breakdown.join(', ')}.`;
      }
    }
    // Count query (e.g., "how many wire transfers")
    else if (transferType !== 'all') {
      response = `You made ${transactionCount} ${transferTypeName} for ${description}`;
      if (totalIn > 0 && totalOut > 0) {
        response += `: ${countIn} deposits totaling ${formatCurrency(totalIn)} and ${countOut} withdrawals totaling ${formatCurrency(totalOut)}.`;
      } else if (totalIn > 0) {
        response += ` totaling ${formatCurrency(totalIn)} deposited.`;
      } else {
        response += ` totaling ${formatCurrency(totalOut)} withdrawn.`;
      }
    }
    // General fund movements query
    else {
      response = `For ${description}, you had ${transactionCount} fund movements: ${countIn} deposits totaling ${formatCurrency(totalIn)} and ${countOut} withdrawals totaling ${formatCurrency(totalOut)}. Net: ${formatCurrency(totalIn - totalOut)}.`;
    }

    // Build UI data
    const uiData: FundTransfersUIData = {
      transferType,
      direction,
      totalAmount,
      transactionCount,
      timePeriod: description,
      totalIn,
      totalOut,
      countIn,
      countOut,
      transfers: data.slice(0, 10).map(t => ({
        date: t.Date,
        type: t.Type,
        direction: t.CrDr === 'CR' ? 'in' : 'out',
        amount: t.Amount || 0,
        transNumber: t.TransNumber,
      })),
      // Include searchedAmount for specific amount queries
      ...(amount ? { searchedAmount: amount } : {}),
    };

    return NextResponse.json({ response, uiData });

  } catch (error) {
    const { userMessage, logEntry } = handleQueryError(error, {
      endpoint: 'fund-transfers',
      params: { transferType: 'unknown', timePeriod: 'unknown' },
    });

    console.error(`[fund-transfers] [${logEntry.code}] ${logEntry.message}`);

    return NextResponse.json({
      response: userMessage,
    });
  }
}
