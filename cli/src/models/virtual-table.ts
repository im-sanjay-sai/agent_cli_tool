import { z } from 'zod';

// Column internal type for virtual tables
export const VirtualTableColumnSchema = z.object({
  name: z.string(),
  field: z.string(),
  fieldType: z.string(),
  displayName: z.string().optional(),
  dataTypeId: z.number().optional(),
});

// Virtual table for CLI storage
export const VirtualTableStorageSchema = z.object({
  id: z.string(),
  name: z.string(),
  sql: z.string(),
  columns: z.array(VirtualTableColumnSchema).optional(),
  ownerTenantFields: z.array(z.string()).optional(),
  updatedAt: z.string().datetime(),
  revision: z.number(),
});

// Virtual table creation input
export const VirtualTableCreateInputSchema = z.object({
  name: z.string().min(1, 'Virtual table name is required'),
  sql: z.string().min(1, 'SQL query is required'),
  ownerTenantFields: z.array(z.string()).optional(),
});

// Virtual table update input
export const VirtualTableUpdateInputSchema = z.object({
  name: z.string().optional(),
  sql: z.string().optional(),
  ownerTenantFields: z.array(z.string()).optional(),
});

// Virtual table API response
export const VirtualTableResponseSchema = z.object({
  _id: z.string(),
  name: z.string(),
  viewQuery: z.string(),
  ownerTenantFields: z.array(z.string()).optional(),
  columns: z.array(VirtualTableColumnSchema).optional(),
});

// Virtual table test result
export const VirtualTableTestResultSchema = z.object({
  success: z.boolean(),
  rows: z.array(z.record(z.any())).optional(),
  fields: z.array(VirtualTableColumnSchema).optional(),
  error: z.string().optional(),
  rowCount: z.number().optional(),
});

// Types
export type VirtualTableColumn = z.infer<typeof VirtualTableColumnSchema>;
export type VirtualTableStorage = z.infer<typeof VirtualTableStorageSchema>;
export type VirtualTableCreateInput = z.infer<typeof VirtualTableCreateInputSchema>;
export type VirtualTableUpdateInput = z.infer<typeof VirtualTableUpdateInputSchema>;
export type VirtualTableResponse = z.infer<typeof VirtualTableResponseSchema>;
export type VirtualTableTestResult = z.infer<typeof VirtualTableTestResultSchema>;
