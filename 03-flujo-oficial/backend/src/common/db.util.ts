import { Pool, QueryResult } from 'pg';

const TRANSIENT = new Set(['ECONNREFUSED', '57P01', '08006', '08001', '08004', 'ETIMEDOUT', 'ENOTFOUND']);

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 800): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (i < retries - 1 && TRANSIENT.has(err.code)) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function dbQuery(pool: Pool, sql: string, params?: any[]): Promise<QueryResult> {
  return withRetry(() => pool.query(sql, params));
}
