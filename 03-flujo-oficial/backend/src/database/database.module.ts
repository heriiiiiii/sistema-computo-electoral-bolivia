import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const DB_POOL = 'DB_POOL';

const poolProvider = {
  provide: DB_POOL,
  useFactory: () => {
    const pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://oep_user:oep_password@localhost:5434/oep_oficial',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 8000,
    });
    pool.on('error', (err) => console.error('[DB] pool error:', err.message));
    return pool;
  },
};

@Global()
@Module({
  providers: [poolProvider],
  exports: [DB_POOL],
})
export class DatabaseModule {}
