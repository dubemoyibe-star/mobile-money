import { Pool, PoolConfig, QueryConfig, QueryResult } from "pg";

// Configuration for slow query logging
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || "1000");
const ENABLE_SLOW_QUERY_LOGGING = process.env.ENABLE_SLOW_QUERY_LOGGING === "true" || 
  (process.env.NODE_ENV === "development" && process.env.ENABLE_SLOW_QUERY_LOGGING !== "false");

/**
 * Sanitizes a SQL query by removing sensitive data patterns
 */
function sanitizeQuery(query: string): string {
  return query
    // Remove potential sensitive values in WHERE clauses
    .replace(/(WHERE\s+[^=]+\s*=\s*)'[^']*'/gi, '$1***')
    .replace(/(WHERE\s+[^=]+\s*=\s*)\d+/gi, '$1***')
    // Remove sensitive data in INSERT/UPDATE values
    .replace(/(VALUES\s*\([^)]*)'[^']*'([^)]*\))/gi, '$1***$2')
    .replace(/(SET\s+[^=]+\s*=\s*)'[^']*'/gi, '$1***')
    .replace(/(SET\s+[^=]+\s*=\s*)\d+/gi, '$1***')
    // Remove email patterns
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***')
    // Remove phone number patterns
    .replace(/\b\d{10,}\b/g, '***')
    // Remove API keys and tokens
    .replace(/\b[A-Za-z0-9]{20,}\b/g, '***');
}

/**
 * Sanitizes query parameters to remove sensitive data
 */
function sanitizeParams(params: any[]): any[] {
  if (!params || !Array.isArray(params)) return params;
  
  return params.map(param => {
    if (typeof param === 'string') {
      // Check for email patterns
      if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/.test(param)) {
        return '***@***.***';
      }
      // Check for phone numbers (10+ digits)
      if (/^\d{10,}$/.test(param)) {
        return '***';
      }
      // Check for potential API keys/tokens (20+ chars, alphanumeric)
      if (/^[A-Za-z0-9]{20,}$/.test(param)) {
        return '***';
      }
      // Check for potential sensitive data in quotes
      if (param.length > 50) {
        return '***';
      }
      return param;
    }
    if (typeof param === 'number' && param > 1000000) {
      return '***';
    }
    return param;
  });
}

/**
 * Logs slow queries with sanitized information
 */
function logSlowQuery(query: string, duration: number, params?: any[]): void {
  if (!ENABLE_SLOW_QUERY_LOGGING) return;
  
  const logEntry = {
    type: "slow_query",
    duration: Math.round(duration),
    threshold: SLOW_QUERY_THRESHOLD_MS,
    query: sanitizeQuery(query),
    params: params ? sanitizeParams(params) : undefined,
    timestamp: new Date().toISOString()
  };
  
  console.log(JSON.stringify(logEntry));
}

// Enhanced Pool with query timing
class SlowQueryPool extends Pool {
  async query<T = any>(queryConfig: QueryConfig | string, values?: any[]): Promise<QueryResult<T>> {
    const startTime = process.hrtime.bigint();
    const queryString = typeof queryConfig === 'string' ? queryConfig : queryConfig.text;
    const queryParams = typeof queryConfig === 'string' ? values : queryConfig.values;
    
    try {
      const result = await super.query<T>(queryConfig, values);
      
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;
      
      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        logSlowQuery(queryString, durationMs, queryParams);
      }
      
      return result;
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1e6;
      
      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        logSlowQuery(queryString, durationMs, queryParams);
      }
      
      throw error;
    }
  }
}

export const pool = new SlowQueryPool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
