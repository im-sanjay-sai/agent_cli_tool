import { describe, it, expect } from 'vitest';
import {
  validateDashboardSchema,
  validateReportSchema,
  validateVirtualTableSchema,
  validatePivot,
} from '../../src/core/validator.js';

describe('Schema Validation', () => {
  describe('Dashboard Schema', () => {
    it('should validate a valid dashboard', () => {
      const dashboard = {
        id: 'dash_123',
        name: 'Test Dashboard',
        globalFilters: [],
        reportIds: [],
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateDashboardSchema(dashboard);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject dashboard without required fields', () => {
      const dashboard = {
        name: 'Test Dashboard',
      };

      const result = validateDashboardSchema(dashboard);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate dashboard with global filters', () => {
      const dashboard = {
        id: 'dash_123',
        name: 'Test Dashboard',
        globalFilters: [
          {
            id: 'date_filter',
            type: 'date_range',
            field: 'created_at',
            label: 'Date Range',
          },
        ],
        reportIds: ['rep_1', 'rep_2'],
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateDashboardSchema(dashboard);
      expect(result.valid).toBe(true);
    });
  });

  describe('Report Schema', () => {
    it('should validate a valid report', () => {
      const report = {
        id: 'rep_123',
        dashboardId: 'dash_123',
        name: 'Test Report',
        baseSql: 'SELECT * FROM users',
        chartType: 'bar',
        params: [],
        pivot: null,
        order: 0,
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateReportSchema(report);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate report with pivot', () => {
      const report = {
        id: 'rep_123',
        dashboardId: 'dash_123',
        name: 'Test Report',
        baseSql: 'SELECT date, revenue FROM sales',
        chartType: 'bar',
        params: [],
        pivot: {
          rowField: 'date',
          aggregationType: 'sum',
          valueField: 'revenue',
        },
        order: 0,
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateReportSchema(report);
      expect(result.valid).toBe(true);
    });
  });

  describe('Virtual Table Schema', () => {
    it('should validate a valid virtual table', () => {
      const vt = {
        id: 'vt_123',
        name: 'orders_enriched',
        sql: 'SELECT * FROM orders JOIN users ON orders.user_id = users.id',
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateVirtualTableSchema(vt);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate virtual table with owner tenant fields', () => {
      const vt = {
        id: 'vt_123',
        name: 'orders_enriched',
        sql: 'SELECT * FROM orders',
        ownerTenantFields: ['org_id'],
        updatedAt: new Date().toISOString(),
        revision: 1,
      };

      const result = validateVirtualTableSchema(vt);
      expect(result.valid).toBe(true);
    });
  });

  describe('Pivot Validation', () => {
    it('should validate single aggregation pivot', () => {
      const pivot = {
        rowField: 'date',
        aggregationType: 'sum',
        valueField: 'revenue',
      };

      const result = validatePivot(pivot);
      expect(result.valid).toBe(true);
    });

    it('should validate multi aggregation pivot', () => {
      const pivot = {
        rowField: 'date',
        columnField: 'product',
        aggregations: [
          { valueField: 'revenue', aggregationType: 'sum' },
          { valueField: 'quantity', aggregationType: 'count' },
        ],
      };

      const result = validatePivot(pivot);
      expect(result.valid).toBe(true);
    });

    it('should warn when pivot has no row or column field', () => {
      const pivot = {
        aggregationType: 'sum',
        valueField: 'revenue',
      };

      const result = validatePivot(pivot);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
