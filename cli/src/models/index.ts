// Re-export all models
export * from './filter.js';
export * from './pivot.js';
export * from './report.js';
export * from './dashboard.js';
export * from './virtual-table.js';

// Common types used across the CLI
import { z } from 'zod';

// Resource types
export const ResourceTypeSchema = z.enum(['dashboard', 'report', 'virtual_table']);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

// Tenant types
export const TenantSchema = z.object({
  tenantField: z.string(),
  fieldType: z.enum(['string', 'number']),
  label: z.string().optional(),
});

export const TenantMappingSchema = z.object({
  id: z.string(),
  tenantField: z.string(),
  table: z.string(),
  column: z.string(),
  fieldType: z.enum(['string', 'number']),
});

export type Tenant = z.infer<typeof TenantSchema>;
export type TenantMapping = z.infer<typeof TenantMappingSchema>;

// Schema types
export const TableSchemaSchema = z.object({
  name: z.string(),
  schema: z.string().optional(),
  catalog: z.string().optional(),
  columns: z.array(z.object({
    name: z.string(),
    type: z.string(),
    nullable: z.boolean().optional(),
  })),
});

export const DatabaseSchemaSchema = z.record(z.array(z.string()));

export type TableSchema = z.infer<typeof TableSchemaSchema>;
export type DatabaseSchema = z.infer<typeof DatabaseSchemaSchema>;
