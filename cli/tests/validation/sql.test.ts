import { describe, it, expect } from 'vitest';
import { validateSql } from '../../src/utils/sql.js';
import { validateSqlStructure, extractColumns } from '../../src/utils/ast.js';

describe('SQL Validation', () => {
  describe('validateSql', () => {
    it('should validate a simple SELECT query', () => {
      const result = validateSql('SELECT id, name FROM users');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty SQL', () => {
      const result = validateSql('');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject DROP TABLE', () => {
      const result = validateSql('DROP TABLE users');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('dangerous'))).toBe(true);
    });

    it('should reject DELETE FROM', () => {
      const result = validateSql('DELETE FROM users WHERE id = 1');
      expect(result.valid).toBe(false);
    });

    it('should reject UPDATE statements', () => {
      const result = validateSql('UPDATE users SET name = "test"');
      expect(result.valid).toBe(false);
    });

    it('should reject INSERT INTO', () => {
      const result = validateSql('INSERT INTO users (name) VALUES ("test")');
      expect(result.valid).toBe(false);
    });

    it('should allow WITH (CTE) queries', () => {
      const result = validateSql(`
        WITH active_users AS (
          SELECT * FROM users WHERE active = true
        )
        SELECT * FROM active_users
      `);
      expect(result.valid).toBe(true);
    });

    it('should warn about SELECT *', () => {
      const result = validateSql('SELECT * FROM users');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('SELECT *'))).toBe(true);
    });

    it('should warn about missing LIMIT', () => {
      const result = validateSql('SELECT id FROM users');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('LIMIT'))).toBe(true);
    });

    it('should not warn about LIMIT when present', () => {
      const result = validateSql('SELECT id FROM users LIMIT 100');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('LIMIT'))).toBe(false);
    });
  });

  describe('validateSqlStructure', () => {
    it('should extract table names from FROM clause', () => {
      const result = validateSqlStructure('SELECT * FROM users');
      expect(result.success).toBe(true);
      expect(result.tables).toContain('users');
    });

    it('should extract table names from JOIN', () => {
      const result = validateSqlStructure(`
        SELECT * FROM orders
        JOIN users ON orders.user_id = users.id
        LEFT JOIN products ON orders.product_id = products.id
      `);
      expect(result.success).toBe(true);
      expect(result.tables).toContain('orders');
      expect(result.tables).toContain('users');
      expect(result.tables).toContain('products');
    });
  });

  describe('extractColumns', () => {
    it('should extract column names', () => {
      const columns = extractColumns('SELECT id, name, email FROM users');
      expect(columns).toContain('id');
      expect(columns).toContain('name');
      expect(columns).toContain('email');
    });

    it('should handle SELECT *', () => {
      const columns = extractColumns('SELECT * FROM users');
      expect(columns).toContain('*');
    });

    it('should extract aliases', () => {
      const columns = extractColumns('SELECT id AS user_id, name AS user_name FROM users');
      expect(columns).toContain('user_id');
      expect(columns).toContain('user_name');
    });

    it('should handle functions', () => {
      const columns = extractColumns('SELECT COUNT(*) AS total, SUM(amount) AS sum FROM orders');
      expect(columns).toContain('total');
      expect(columns).toContain('sum');
    });
  });
});
