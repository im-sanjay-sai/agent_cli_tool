import { validateSqlStructure } from './ast.js';

export interface SqlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  tables?: string[];
}

/**
 * Validate SQL query structure
 */
export function validateSql(sql: string): SqlValidationResult {
  const result = validateSqlStructure(sql);
  
  if (!result.success) {
    return {
      valid: false,
      errors: [result.error || 'Invalid SQL'],
      warnings: [],
    };
  }

  const warnings: string[] = [];
  
  // Check for SELECT *
  if (/SELECT\s+\*/i.test(sql)) {
    warnings.push('Using SELECT * is not recommended. Consider specifying columns explicitly.');
  }

  // Check for missing LIMIT
  if (!/\bLIMIT\b/i.test(sql)) {
    warnings.push('Query does not have a LIMIT clause. Consider adding one to prevent large result sets.');
  }

  return {
    valid: true,
    errors: [],
    warnings,
    tables: result.tables,
  };
}

/**
 * Wrap SQL in EXPLAIN for validation (PostgreSQL)
 */
export function wrapInExplain(sql: string): string {
  return `EXPLAIN (FORMAT JSON) ${sql}`;
}

/**
 * Add LIMIT to a query if not present
 */
export function addLimitIfMissing(sql: string, limit: number = 1000): string {
  if (/\bLIMIT\b/i.test(sql)) {
    return sql;
  }
  return `${sql.replace(/;\s*$/, '')} LIMIT ${limit}`;
}
