import { z } from 'zod';
import {
  ReportConfigSchema,
  DashboardStorageSchema,
  VirtualTableStorageSchema,
  PivotSchema,
} from '../models/index.js';
import { validateSql } from '../utils/sql.js';
import { parseToAst } from './client.js';
import { verbose } from '../output/formatter.js';
import { isAuthenticated } from './auth.js';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationIssue {
  field?: string;
  message: string;
  code: string;
}

/**
 * Validate dashboard schema
 */
export function validateDashboardSchema(data: unknown): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  try {
    DashboardStorageSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      result.valid = false;
      result.errors = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
      }));
    }
  }
  
  return result;
}

/**
 * Validate report schema
 */
export function validateReportSchema(data: unknown): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  try {
    ReportConfigSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      result.valid = false;
      result.errors = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
      }));
    }
  }
  
  return result;
}

/**
 * Validate virtual table schema
 */
export function validateVirtualTableSchema(data: unknown): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  try {
    VirtualTableStorageSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      result.valid = false;
      result.errors = error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: 'SCHEMA_ERROR',
      }));
    }
  }
  
  return result;
}

/**
 * Validate report fully (schema + SQL + pivot + optional AST)
 * Accepts report data directly (fetched from the API by the caller).
 */
export async function validateReport(
  reportData: Record<string, unknown>,
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  const report = reportData;
  
  // 1. Schema validation
  const schemaResult = validateReportSchema(report);
  if (!schemaResult.valid) {
    result.valid = false;
    result.errors.push(...schemaResult.errors);
  }
  result.warnings.push(...schemaResult.warnings);
  
  // 2. Check required fields
  if (!report.baseSql) {
    result.valid = false;
    result.errors.push({
      field: 'baseSql',
      message: 'baseSql is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!report.chartType) {
    result.valid = false;
    result.errors.push({
      field: 'chartType',
      message: 'chartType is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  if (!report.dashboardId) {
    result.valid = false;
    result.errors.push({
      field: 'dashboardId',
      message: 'dashboardId is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  // 3. Validate SQL structure
  const baseSql = report.baseSql as string | undefined;
  if (baseSql) {
    const sqlResult = validateSql(baseSql);
    if (!sqlResult.valid) {
      result.valid = false;
      result.errors.push(...sqlResult.errors.map(e => ({
        field: 'baseSql',
        message: e,
        code: 'SQL_ERROR',
      })));
    }
    result.warnings.push(...sqlResult.warnings.map(w => ({
      field: 'baseSql',
      message: w,
      code: 'SQL_WARNING',
    })));
  }
  
  // 4. Validate pivot if enabled
  if (report.pivot) {
    const pivotResult = validatePivot(report.pivot);
    if (!pivotResult.valid) {
      result.valid = false;
      result.errors.push(...pivotResult.errors);
    }
    result.warnings.push(...pivotResult.warnings);
  }
  
  // 5. AST validation via remote API (always attempt when authenticated)
  if (baseSql && await isAuthenticated()) {
    try {
      verbose('Validating SQL via AST parser...');
      const astResponse = await parseToAst(baseSql);
      const astData = astResponse.data as Record<string, unknown> | undefined;
      if (astData?.success === false) {
        result.warnings.push({
          field: 'baseSql',
          message: `AST parsing warning: ${(astData.message as string) || 'Unknown error'}`,
          code: 'AST_WARNING',
        });
      }
    } catch (error) {
      verbose(`AST validation skipped: ${error}`);
      result.warnings.push({
        message: 'AST validation skipped (network unavailable)',
        code: 'VALIDATION_SKIPPED',
      });
    }
  }
  
  return result;
}

/**
 * Validate pivot configuration
 */
export function validatePivot(pivot: unknown): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  try {
    const parsed = PivotSchema.parse(pivot);
    
    // Check for required fields based on pivot type
    if ('aggregations' in parsed && parsed.aggregations) {
      // Multi-aggregation pivot
      if (parsed.aggregations.length === 0) {
        result.warnings.push({
          field: 'pivot.aggregations',
          message: 'Pivot has no aggregations defined',
          code: 'PIVOT_WARNING',
        });
      }
      
      for (let i = 0; i < parsed.aggregations.length; i++) {
        const agg = parsed.aggregations[i];
        if (!agg.aggregationType) {
          result.valid = false;
          result.errors.push({
            field: `pivot.aggregations[${i}].aggregationType`,
            message: 'aggregationType is required',
            code: 'REQUIRED_FIELD',
          });
        }
      }
    } else if ('aggregationType' in parsed) {
      // Single aggregation pivot
      if (!parsed.aggregationType) {
        result.valid = false;
        result.errors.push({
          field: 'pivot.aggregationType',
          message: 'aggregationType is required for single-aggregation pivot',
          code: 'REQUIRED_FIELD',
        });
      }
    }
    
    // Check for row or column field
    if (!parsed.rowField && !parsed.columnField) {
      result.warnings.push({
        field: 'pivot',
        message: 'Pivot has neither rowField nor columnField defined',
        code: 'PIVOT_WARNING',
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      result.valid = false;
      result.errors = error.issues.map(issue => ({
        field: `pivot.${issue.path.join('.')}`,
        message: issue.message,
        code: 'SCHEMA_ERROR',
      }));
    }
  }
  
  return result;
}

/**
 * Validate virtual table fully (schema + SQL)
 * Accepts VT data directly (fetched from the API by the caller).
 */
export async function validateVirtualTable(
  vtData: Record<string, unknown>,
): Promise<ValidationResult> {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };
  
  // Schema validation
  const schemaResult = validateVirtualTableSchema(vtData);
  if (!schemaResult.valid) {
    result.valid = false;
    result.errors.push(...schemaResult.errors);
  }
  result.warnings.push(...schemaResult.warnings);
  
  // Validate SQL
  const sql = vtData.sql as string | undefined;
  if (sql) {
    const sqlResult = validateSql(sql);
    if (!sqlResult.valid) {
      result.valid = false;
      result.errors.push(...sqlResult.errors.map(e => ({
        field: 'sql',
        message: e,
        code: 'SQL_ERROR',
      })));
    }
    result.warnings.push(...sqlResult.warnings.map(w => ({
      field: 'sql',
      message: w,
      code: 'SQL_WARNING',
    })));
  } else {
    result.valid = false;
    result.errors.push({
      field: 'sql',
      message: 'sql is required',
      code: 'REQUIRED_FIELD',
    });
  }
  
  return result;
}
