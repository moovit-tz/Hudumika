import { sql } from 'kysely';
import { db, dbReadonly } from '../db/client.js';
import { findAllowedTable, isAllowedColumn } from './queryBuilderSchema.js';

export interface QueryFilter {
  column: string;
  operator: '=' | '!=' | '>' | '<' | 'contains' | 'is_null' | 'is_not_null';
  value?: string;
}

export interface VisualQueryParams {
  table: string;
  columns: string[];
  filters?: QueryFilter[];
  tenant_id?: string;
  group_by?: string;
  aggregate?: { fn: 'count' | 'sum'; column?: string };
  order_by?: { column: string; direction: 'asc' | 'desc' };
  limit?: number;
}

const MAX_ROWS = 2000;

function assertColumn(tableName: string, allowedCols: Set<string>, column: string) {
  if (!allowedCols.has(column)) {
    throw new Error(`Column "${column}" is not allowed on table "${tableName}"`);
  }
}

/**
 * Assembles a SELECT from a hardcoded allowlist — the actual authorization
 * check happens here (findAllowedTable/isAllowedColumn), before any
 * identifier reaches sql.table()/sql.ref(). Filter *values* are always
 * parameterized; only identifiers use the quoting helpers.
 */
export async function runVisualQuery(params: VisualQueryParams): Promise<{ rows: any[]; generated_sql: string }> {
  const table = findAllowedTable(params.table);
  if (!table) throw new Error(`Table "${params.table}" is not available in the query builder`);
  const allowedCols = new Set(table.columns.map(c => c.name));

  for (const c of params.columns) assertColumn(table.table, allowedCols, c);
  if (params.group_by) assertColumn(table.table, allowedCols, params.group_by);
  if (params.aggregate?.column) assertColumn(table.table, allowedCols, params.aggregate.column);
  if (params.order_by) assertColumn(table.table, allowedCols, params.order_by.column);
  for (const f of params.filters || []) assertColumn(table.table, allowedCols, f.column);

  const selectParts: any[] = [];
  if (params.group_by) {
    selectParts.push(sql`${sql.ref(params.group_by)} AS bucket`);
    if (params.aggregate?.fn === 'sum' && params.aggregate.column) {
      selectParts.push(sql`COALESCE(SUM(${sql.ref(params.aggregate.column)}), 0) AS value`);
    } else {
      selectParts.push(sql`COUNT(*) AS value`);
    }
  } else {
    for (const c of params.columns) selectParts.push(sql.ref(c));
  }
  const selectClause = sql.join(selectParts, sql`, `);

  const conditions = [sql`1=1`];
  if (params.tenant_id && allowedCols.has('tenant_id')) {
    conditions.push(sql`tenant_id = ${params.tenant_id}`);
  }
  for (const f of params.filters || []) {
    const ref = sql.ref(f.column);
    switch (f.operator) {
      case '=': conditions.push(sql`${ref} = ${f.value}`); break;
      case '!=': conditions.push(sql`${ref} != ${f.value}`); break;
      case '>': conditions.push(sql`${ref} > ${f.value}`); break;
      case '<': conditions.push(sql`${ref} < ${f.value}`); break;
      case 'contains': conditions.push(sql`${ref}::text ILIKE ${'%' + (f.value || '') + '%'}`); break;
      case 'is_null': conditions.push(sql`${ref} IS NULL`); break;
      case 'is_not_null': conditions.push(sql`${ref} IS NOT NULL`); break;
    }
  }
  const whereClause = sql.join(conditions, sql` AND `);

  const limit = Math.min(params.limit || MAX_ROWS, MAX_ROWS);

  let query = sql`SELECT ${selectClause} FROM ${sql.table(table.table)} WHERE ${whereClause}`;
  if (params.group_by) query = sql`${query} GROUP BY ${sql.ref(params.group_by)}`;
  if (params.order_by) {
    const dir = params.order_by.direction === 'asc' ? sql`ASC` : sql`DESC`;
    query = sql`${query} ORDER BY ${sql.ref(params.order_by.column)} ${dir}`;
  } else if (params.group_by) {
    query = sql`${query} ORDER BY value DESC`;
  }
  query = sql`${query} LIMIT ${limit}`;

  const compiled = query.compile(db);
  const result = await query.execute(db);
  return { rows: result.rows, generated_sql: compiled.sql };
}

const BLOCKED_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'TRUNCATE', 'GRANT', 'REVOKE',
  'CREATE', 'EXECUTE', 'CALL', 'COPY', 'VACUUM', 'REINDEX', 'CLUSTER',
  'PG_READ_FILE', 'PG_WRITE_FILE', 'DBLINK', 'LO_IMPORT', 'LO_EXPORT',
];

export function validateRawSql(sqlText: string): string {
  const trimmed = sqlText.trim().replace(/;\s*$/, '');
  if (!trimmed) throw new Error('Query is empty');
  if (trimmed.includes(';')) throw new Error('Only a single statement is allowed');
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) throw new Error('Query must start with SELECT or WITH');
  for (const kw of BLOCKED_KEYWORDS) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(trimmed)) throw new Error(`Query contains a disallowed keyword: ${kw}`);
  }
  return trimmed;
}

/**
 * Raw SQL mode. Application-layer checks above are the first, cheap line of
 * defense — the real backstop is running through the SELECT-only
 * hudumika_readonly Postgres role (dbReadonly, see db/client.ts) inside a
 * READ ONLY transaction with a short statement_timeout, wrapped in a
 * LIMIT-enforcing subquery. Even a validation bypass can't write or run
 * unbounded here.
 */
export async function runRawQuery(sqlText: string): Promise<{ rows: any[]; generated_sql: string }> {
  const validated = validateRawSql(sqlText);
  const wrappedSql = `SELECT * FROM (${validated}) AS _qb_sub LIMIT ${MAX_ROWS}`;

  const rows = await dbReadonly.transaction().execute(async (trx) => {
    await sql`SET LOCAL statement_timeout = '10000'`.execute(trx);
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    const result = await sql.raw(wrappedSql).execute(trx);
    return result.rows;
  });

  return { rows, generated_sql: wrappedSql };
}
