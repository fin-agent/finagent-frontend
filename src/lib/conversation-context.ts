/**
 * Conversation Context Store
 *
 * Tracks the last query parameters per conversation so follow-up queries
 * can inherit context (e.g., symbol) without explicit re-specification.
 *
 * Uses Supabase for persistent storage across serverless function instances.
 *
 * Example flow:
 * 1. User: "Apple trades in January" → stores { symbol: "AAPL", ... }
 * 2. User: "How about September?" → retrieves AAPL from context
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface QueryContext {
  symbol?: string;
  timePeriod?: string;
  dateFilter?: {
    type: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  };
  tradeType?: string;
  queryType?: string;
  feeType?: string;
  timestamp: number;
}

// In-memory cache for fast access within same function invocation
const memoryCache = new Map<string, QueryContext>();

// Context expires after 10 minutes of inactivity
const CONTEXT_TTL_MS = 10 * 60 * 1000;

/**
 * Generate a conversation key from available identifiers
 */
export function getConversationKey(params: {
  conversationId?: string;
  agentId?: string;
  sessionId?: string;
  clientIp?: string;
}): string {
  // Log what identifiers we received for debugging
  console.log('🔑 [Context] Available identifiers:', {
    conversationId: params.conversationId || '(none)',
    agentId: params.agentId || '(none)',
    sessionId: params.sessionId || '(none)',
    clientIp: params.clientIp || '(none)',
  });

  // Prefer conversationId, then agentId, then sessionId, then IP, then default
  const key = params.conversationId || params.agentId || params.sessionId || params.clientIp || 'default';
  console.log(`🔑 [Context] Using key: ${key}`);
  return key;
}

/**
 * Store query context for a conversation (async, uses Supabase)
 */
export async function storeContextAsync(
  conversationKey: string,
  context: Omit<QueryContext, 'timestamp'>
): Promise<void> {
  // Only store if we have meaningful context
  if (!context.symbol && !context.feeType && !context.queryType) {
    console.log(`⚠️ [Context] Not storing - no meaningful context:`, context);
    return;
  }

  const existing = memoryCache.get(conversationKey);
  console.log(`📦 [Context] Existing memory cache for ${conversationKey}:`, existing || '(none)');

  // Merge with existing context (new values override)
  const merged: QueryContext = {
    ...existing,
    ...context,
    timestamp: Date.now(),
  };

  // Remove undefined values
  Object.keys(merged).forEach(key => {
    if (merged[key as keyof QueryContext] === undefined) {
      delete merged[key as keyof QueryContext];
    }
  });

  // Update memory cache
  memoryCache.set(conversationKey, merged);

  // Persist to Supabase
  try {
    const { error } = await supabase
      .from('ConversationContext')
      .upsert({
        context_key: conversationKey,
        symbol: merged.symbol,
        time_period: merged.timePeriod,
        date_filter: merged.dateFilter,
        trade_type: merged.tradeType,
        query_type: merged.queryType,
        fee_type: merged.feeType,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'context_key',
      });

    if (error) {
      console.log(`⚠️ [Context] Supabase upsert error (table may not exist):`, error.message);
      // Continue with memory-only storage
    } else {
      console.log(`💾 [Context] Persisted to Supabase for ${conversationKey}`);
    }
  } catch (e) {
    console.log(`⚠️ [Context] Supabase error:`, e);
  }

  console.log(`✅ [Context] Stored for ${conversationKey}:`, {
    symbol: merged.symbol,
    timePeriod: merged.timePeriod,
    queryType: merged.queryType,
    dateFilter: merged.dateFilter,
  });
}

/**
 * Synchronous store for backward compatibility (fire-and-forget)
 */
export function storeContext(
  conversationKey: string,
  context: Omit<QueryContext, 'timestamp'>
): void {
  // Fire async store without waiting
  storeContextAsync(conversationKey, context).catch(e => {
    console.log(`⚠️ [Context] Background store error:`, e);
  });
}

/**
 * Retrieve context for a conversation (async, checks Supabase)
 */
export async function getContextAsync(conversationKey: string): Promise<QueryContext | null> {
  // Check memory cache first
  let context = memoryCache.get(conversationKey);

  if (!context) {
    // Try to fetch from Supabase
    try {
      const { data, error } = await supabase
        .from('ConversationContext')
        .select('*')
        .eq('context_key', conversationKey)
        .single();

      if (!error && data) {
        const updatedAt = new Date(data.updated_at).getTime();
        context = {
          symbol: data.symbol,
          timePeriod: data.time_period,
          dateFilter: data.date_filter,
          tradeType: data.trade_type,
          queryType: data.query_type,
          feeType: data.fee_type,
          timestamp: updatedAt,
        };
        // Cache in memory
        memoryCache.set(conversationKey, context);
        console.log(`📥 [Context] Loaded from Supabase for ${conversationKey}:`, context);
      }
    } catch (e) {
      console.log(`⚠️ [Context] Supabase fetch error:`, e);
    }
  }

  if (!context) {
    return null;
  }

  // Check if context has expired
  if (Date.now() - context.timestamp > CONTEXT_TTL_MS) {
    memoryCache.delete(conversationKey);
    console.log(`🕐 [Context] Expired for ${conversationKey}`);
    return null;
  }

  console.log(`📖 [Context] Retrieved for ${conversationKey}:`, {
    symbol: context.symbol,
    timePeriod: context.timePeriod,
    queryType: context.queryType,
  });

  return context;
}

/**
 * Synchronous get from memory cache only (for backward compatibility)
 */
export function getContext(conversationKey: string): QueryContext | null {
  const context = memoryCache.get(conversationKey);

  if (!context) {
    return null;
  }

  // Check if context has expired
  if (Date.now() - context.timestamp > CONTEXT_TTL_MS) {
    memoryCache.delete(conversationKey);
    console.log(`🕐 [Context] Expired for ${conversationKey}`);
    return null;
  }

  console.log(`📖 [Context] Retrieved from memory for ${conversationKey}:`, {
    symbol: context.symbol,
    timePeriod: context.timePeriod,
    queryType: context.queryType,
  });

  return context;
}

/**
 * Merge incoming parameters with stored context (async version)
 * Only fills in missing values - explicit params always win
 */
export async function mergeWithContextAsync(
  conversationKey: string,
  params: {
    symbol?: string;
    timePeriod?: string;
    dateFilter?: QueryContext['dateFilter'];
    tradeType?: string;
    queryType?: string;
    feeType?: string;
  }
): Promise<typeof params & { _contextApplied?: boolean }> {
  console.log(`🔄 [Context] mergeWithContextAsync called for key: ${conversationKey}`);
  console.log(`🔄 [Context] Incoming params:`, params);

  const context = await getContextAsync(conversationKey);

  if (!context) {
    console.log(`❌ [Context] No stored context found for ${conversationKey}`);
    return params;
  }

  console.log(`✨ [Context] Found stored context:`, {
    symbol: context.symbol,
    timePeriod: context.timePeriod,
    queryType: context.queryType,
  });

  const merged = { ...params };
  let contextApplied = false;

  // Only fill in missing symbol from context
  if (!merged.symbol && context.symbol) {
    merged.symbol = context.symbol;
    contextApplied = true;
    console.log(`🔗 [Context] Applied symbol from context: ${context.symbol}`);
  }

  // Only fill in missing feeType from context
  if (!merged.feeType && context.feeType) {
    merged.feeType = context.feeType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied feeType from context: ${context.feeType}`);
  }

  // Only fill in missing queryType from context
  if (!merged.queryType && context.queryType) {
    merged.queryType = context.queryType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied queryType from context: ${context.queryType}`);
  }

  console.log(`📤 [Context] Merged result:`, merged);
  console.log(`📤 [Context] Context was applied: ${contextApplied}`);

  return {
    ...merged,
    _contextApplied: contextApplied,
  };
}

/**
 * Synchronous merge from memory cache only (for backward compatibility)
 */
export function mergeWithContext(
  conversationKey: string,
  params: {
    symbol?: string;
    timePeriod?: string;
    dateFilter?: QueryContext['dateFilter'];
    tradeType?: string;
    queryType?: string;
    feeType?: string;
  }
): typeof params & { _contextApplied?: boolean } {
  console.log(`🔄 [Context] mergeWithContext called for key: ${conversationKey}`);
  console.log(`🔄 [Context] Incoming params:`, params);

  const context = getContext(conversationKey);

  if (!context) {
    console.log(`❌ [Context] No stored context found for ${conversationKey}`);
    return params;
  }

  console.log(`✨ [Context] Found stored context:`, {
    symbol: context.symbol,
    timePeriod: context.timePeriod,
    queryType: context.queryType,
  });

  const merged = { ...params };
  let contextApplied = false;

  // Only fill in missing symbol from context
  if (!merged.symbol && context.symbol) {
    merged.symbol = context.symbol;
    contextApplied = true;
    console.log(`🔗 [Context] Applied symbol from context: ${context.symbol}`);
  }

  // Only fill in missing feeType from context
  if (!merged.feeType && context.feeType) {
    merged.feeType = context.feeType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied feeType from context: ${context.feeType}`);
  }

  // Only fill in missing queryType from context
  if (!merged.queryType && context.queryType) {
    merged.queryType = context.queryType;
    contextApplied = true;
    console.log(`🔗 [Context] Applied queryType from context: ${context.queryType}`);
  }

  console.log(`📤 [Context] Merged result:`, merged);
  console.log(`📤 [Context] Context was applied: ${contextApplied}`);

  return {
    ...merged,
    _contextApplied: contextApplied,
  };
}

/**
 * Clear context for a conversation (e.g., on disconnect)
 */
export function clearContext(conversationKey: string): void {
  memoryCache.delete(conversationKey);
  console.log(`🗑️ [Context] Cleared for ${conversationKey}`);
}

/**
 * Cleanup expired contexts (call periodically)
 */
export function cleanupExpiredContexts(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, context] of memoryCache.entries()) {
    if (now - context.timestamp > CONTEXT_TTL_MS) {
      memoryCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 [Context] Cleaned up ${cleaned} expired contexts`);
  }

  return cleaned;
}

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredContexts, 5 * 60 * 1000);
}
