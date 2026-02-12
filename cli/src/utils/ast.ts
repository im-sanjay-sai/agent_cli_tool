/**
 * AST parsing utilities for SQL validation
 * This provides basic SQL structure validation without a full parser
 */

export interface ASTNode {
  type: string;
  [key: string]: unknown;
}

export interface ParseResult {
  success: boolean;
  ast?: ASTNode;
  error?: string;
  tables?: string[];
  columns?: string[];
}

/**
 * Basic SQL validation - checks for common SQL structure
 * For full AST parsing, the remote 'astify' task should be used
 */
export function validateSqlStructure(sql: string): ParseResult {
  const trimmed = sql.trim();
  
  if (!trimmed) {
    return { success: false, error: 'SQL query cannot be empty' };
  }

  // Check for dangerous operations
  const dangerousPatterns = [
    /\bDROP\s+(TABLE|DATABASE|SCHEMA)\b/i,
    /\bTRUNCATE\s+TABLE\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bUPDATE\s+\w+\s+SET\b/i,
    /\bINSERT\s+INTO\b/i,
    /\bALTER\s+TABLE\b/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      return { 
        success: false, 
        error: 'Potentially dangerous SQL operation detected. Only SELECT queries are allowed.' 
      };
    }
  }

  // Check for basic SELECT structure
  if (!/^\s*SELECT\b/i.test(trimmed) && !/^\s*WITH\b/i.test(trimmed)) {
    return { 
      success: false, 
      error: 'Query must start with SELECT or WITH (CTE)' 
    };
  }

  // Extract table names (basic extraction)
  const fromMatches = trimmed.match(/\bFROM\s+([^\s,()]+)/gi) || [];
  const joinMatches = trimmed.match(/\bJOIN\s+([^\s,()]+)/gi) || [];
  
  const tables = [...fromMatches, ...joinMatches]
    .map(m => m.replace(/^(FROM|JOIN)\s+/i, '').replace(/["`[\]]/g, ''))
    .filter(Boolean);

  return {
    success: true,
    ast: { type: 'SELECT', raw: trimmed },
    tables: [...new Set(tables)],
  };
}

/**
 * Extract column references from SQL (basic extraction)
 */
export function extractColumns(sql: string): string[] {
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/is);
  if (!selectMatch) return [];
  
  const selectClause = selectMatch[1];
  if (selectClause.trim() === '*') return ['*'];
  
  // Split by comma, handling parentheses for functions
  const columns: string[] = [];
  let depth = 0;
  let current = '';
  
  for (const char of selectClause) {
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      columns.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) {
    columns.push(current.trim());
  }
  
  return columns.map(col => {
    // Extract alias if present
    const aliasMatch = col.match(/\s+AS\s+([^\s]+)$/i);
    if (aliasMatch) return aliasMatch[1].replace(/["`[\]]/g, '');
    // Get last part after dot
    const parts = col.split('.');
    return parts[parts.length - 1].replace(/["`[\]]/g, '').trim();
  });
}
