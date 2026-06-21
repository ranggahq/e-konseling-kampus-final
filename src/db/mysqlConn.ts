import mysql from 'mysql2/promise';

// Configure your MySQL connection parameters here or via environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'e_counseling_polinela',
  port: Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create a persistent database connection pool
const pool = mysql.createPool(dbConfig);

export default pool;

/**
 * Helper to execute a query safely with automatic resource management
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}
