import { z } from "npm:zod";
import { tool } from 'npm:ai';
import { supabase } from "../utils/client.ts";
import { convertToCSV } from "./convertToCSV.ts";

const ACCOUNT_CODE = "C40421";

const allColumns = z.enum([
  "TradeID", "AccountCode", "AccountType", "AccountName", "AcctHolderName", 
  "Date", "TradeType", "TradeTimeStamp", "SecurityType", "Symbol", 
  "UnderlyingSymbol", "Expiration", "Strike", "Call/Put", "StockTradePrice", 
  "OptionTradePremium", "StockShareQty", "OptionContracts", "GrossAmount", 
  "Commission", "ExchFees", "NetAmount"
]);

const GetTradesSchema = z.object({
  startDate: z.string().optional()
    .describe("Start date for filtering (in YYYY-MM-DD format)."),
  endDate: z.string().optional()
    .describe("End date for filtering (in YYYY-MM-DD format)."),
  symbol: z.string().optional()
    .describe("Stock symbol (e.g., IBM, AAPL, NVDA, SBUX)."),
  isProfitable: z.boolean().optional()
    .describe("Set to true to show only profitable trades (NetAmount > 0)."),
  limit: z.number().optional().default(20)
    .describe("Maximum number of records to return. Default is 20."),
  orderBy: allColumns.optional().default("Date")
    .describe("Column to use for sorting the results."),
  ascending: z.boolean().optional().default(false)
    .describe("Sort direction. Default (false) is newest to oldest (descending)."),
  tradeType: z.enum(["B", "S"]).optional()
    .describe("Trade type: 'B' = Buy, 'S' = Sell. Translate user input: 'I bought' -> 'B', 'I sold' -> 'S'."),
});

async function getTrades({
  startDate,
  endDate,
  symbol,
  isProfitable,
  limit = 20,
  orderBy = "Date",
  ascending = false,
  tradeType = null
}: z.infer<typeof GetTradesSchema>) {
  try {
    let query = supabase.from("TradeData").select("*")
      .eq("AccountCode", ACCOUNT_CODE);

    if (startDate) query = query.gte("Date", startDate);
    if (endDate) query = query.lte("Date", endDate);
    if (symbol) query = query.eq("Symbol", symbol);
    if (isProfitable) query = query.gt("NetAmount", 0);
    if (tradeType) query = query.eq("TradeType", tradeType);

    query = query.order(orderBy, { ascending }).limit(limit);

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query error: ${error.message}`);

    return JSON.stringify(data, null, 2);
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export const getTradesTool = tool({
  description: `Lists trade records based on specific filters (date range, symbol).
  LLM Note: Convert relative dates like 'last week' or 'yesterday' into YYYY-MM-DD format and send them as 'startDate'/'endDate' to this tool.
  Example: "Show yesterday's trades", "Show profitable trades for IBM"`,
  inputSchema: GetTradesSchema,
  execute: getTrades
});


const GetTradeAggregationSchema = z.object({
  aggregationOperation: z.enum(["sum", "average", "count", "max", "min"])
    .describe("Calculation operation: sum, average, count, max, min."),
  aggregationColumn: allColumns
    .describe("The column to calculate (e.g., StockTradePrice, NetAmount)."),
  startDate: z.string().optional()
    .describe("Start date for filtering (YYYY-MM-DD)."),
  endDate: z.string().optional()
    .describe("End date for filtering (YYYY-MM-DD)."),
  symbol: z.string().optional()
    .describe("Stock symbol (e.g., SBUX, NVDA)."),
  tradeType: z.enum(["B", "S"]).optional()
    .describe("Trade type: 'B' = Buy, 'S' = Sell. Translate user input: 'I bought' -> 'B', 'I sold' -> 'S'."),
});

async function getTradeAggregation({
  aggregationOperation,
  aggregationColumn,
  startDate,
  endDate,
  symbol,
  tradeType
}: z.infer<typeof GetTradeAggregationSchema>) {
  try {
    let query = supabase.from("TradeData").select(aggregationColumn) // Select only the relevant column
      .eq("AccountCode", ACCOUNT_CODE);

    if (startDate) query = query.gte("Date", startDate);
    if (endDate) query = query.lte("Date", endDate);
    if (symbol) query = query.eq("Symbol", symbol);
    if (tradeType) query = query.eq("TradeType", tradeType);
    
    // Note: This approach fetches all data and performs the calculation in JS.
    // It is inefficient for large datasets but provides simplicity without an RPC.
    const { data, error } = await query;
    if (error) throw new Error(`Supabase query error: ${error.message}`);
    if (!data || data.length === 0) return null;

    const values = data.map((row: any) => row[aggregationColumn]).filter((v: any) => typeof v === 'number');
    if (values.length === 0) return null;

    if (aggregationOperation === 'sum') {
      const sum = values.reduce((acc: number, val: number) => acc + val, 0);
      return sum;
    }
    if (aggregationOperation === 'average') {
      const avg = values.reduce((acc: number, val: number) => acc + val, 0) / values.length;
      return avg;
    }
    if (aggregationOperation === 'count') {
      return data.length;
    }
    if (aggregationOperation === 'max') {
      return Math.max(...values);
    }
    if (aggregationOperation === 'min') {
      return Math.min(...values);
    }
    
    return null;
  } catch (e: any) {
    return `Error: ${e.message}`;
  }
}

export const getTradeAggregationTool = tool({
  description: `Performs aggregations like sum, average, count, min/max on a specific column (e.g., StockTradePrice).
  Example: "What was the average buy price for SBUX last month?", "What was the highest sell price for NVDA this year?"`,
  inputSchema: GetTradeAggregationSchema,
  execute: getTradeAggregation
});



const ExportTradesSchema = z.object({
  startDate: z.string().optional()
    .describe("Start date for filtering (YYYY-MM-DD)."),
  endDate: z.string().optional()
    .describe("End date for filtering (YYYY-MM-DD)."),
  symbol: z.string().optional()
    .describe("Stock symbol."),
  isProfitable: z.boolean().optional()
    .describe("Set to true to export only profitable trades (NetAmount > 0)."),
});

// Default columns for CSV
const DEFAULT_EXPORT_COLUMNS = [
  "Date", "TradeTimeStamp", "Symbol", "Exchange", "TradeType", 
  "StockTradePrice", "OptionTradePremium", "StockShareQty", "OptionContracts",
  "NetAmount", "Commission", "ExchFees"
];

async function exportTradesToCsv({
  startDate,
  endDate,
  symbol,
  isProfitable
}: z.infer<typeof ExportTradesSchema>) {
  try {
    let query = supabase.from("TradeData").select(DEFAULT_EXPORT_COLUMNS.join(","))
      .eq("AccountCode", ACCOUNT_CODE); // Always filter by account

    if (startDate) query = query.gte("Date", startDate);
    if (endDate) query = query.lte("Date", endDate);
    if (symbol) query = query.eq("Symbol", symbol);
    if (isProfitable) query = query.gt("NetAmount", 0);

    // Do NOT use limit for CSV export, get all data sorted
    query = query.order("Date", { ascending: false });

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query error: ${error.message}`);
    
    // @ts-ignore (Assuming convertToCSV is defined elsewhere)
    return convertToCSV(data, DEFAULT_EXPORT_COLUMNS);

  } catch (e: any) {
    return `Error creating CSV: ${e.message}`;
  }
}

export const exportTradesToCsvTool = tool({
  description: `Returns filtered trade data as a text string in CSV format.
  LLM Note: Convert relative dates like 'last week' or 'yesterday' into YYYY-MM-DD format and send them as 'startDate'/'endDate' to this tool.
  Example: "Send all my trades from this year as a CSV file"`,
  inputSchema: ExportTradesSchema,
  execute: exportTradesToCsv
});

