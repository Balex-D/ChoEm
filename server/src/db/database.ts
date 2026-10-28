import pg from "pg";
export type Row = Record<string, any>;
export interface Queryable {
  query(
    sql: string,
    values?: any[],
  ): Promise<{ rows: Row[]; rowCount?: number | null }>;
}
export interface Database extends Queryable {
  transaction<T>(run: (client: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () =>
    console.error("PostgreSQL pool error; connection will be replaced"),
  );
  return {
    query: (sql, values) => pool.query(sql, values),
    async transaction(run) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await run(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
