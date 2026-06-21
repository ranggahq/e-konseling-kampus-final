import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;

const dbConfig: pg.PoolConfig = connectionString ? {
  connectionString,
  ssl: process.env.NODE_ENV === 'production' || connectionString.includes('supabase') || connectionString.includes('railway') ? { rejectUnauthorized: false } : false,
} : {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'postgres',
  port: Number(process.env.DB_PORT) || 5432,
  ssl: process.env.NODE_ENV === 'production' || (process.env.DB_HOST && (process.env.DB_HOST.includes('supabase') || process.env.DB_HOST.includes('railway'))) ? { rejectUnauthorized: false } : false,
};

// Create a persistent PostgreSQL database connection pool
const pool = new pg.Pool(dbConfig);

export default pool;

/**
 * Helper to execute a query safely with automatic resource management.
 * Converts MySQL "?" parameter placeholders to PostgreSQL "$1", "$2", etc.
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  let index = 1;
  const postgresSql = sql.replace(/\?/g, () => `$${index++}`);
  
  const res = await pool.query(postgresSql, params);
  return res.rows as unknown as T;
}

