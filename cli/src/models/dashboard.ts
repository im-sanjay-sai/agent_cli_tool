import { z } from 'zod';
import { 
  InternalDashboardStringFilterSchema, 
  InternalDashboardDateFilterSchema,
  InternalDashboardTenantFilterSchema,
} from './filter.js';

// Section order item
export const SectionOrderSchema = z.object({
  _id: z.string(),
  section: z.string(),
  reportOrder: z.array(z.string()),
});

// Dashboard config - aligned with frontend Dashboard.ts DashboardConfig
export const DashboardConfigSchema = z.object({
  dashboardId: z.string(),
  name: z.string(),
  filters: z.array(InternalDashboardStringFilterSchema).default([]),
  allTenantFilters: z.array(InternalDashboardTenantFilterSchema).optional(),
  tenantFilters: z.array(InternalDashboardTenantFilterSchema).optional(),
  dateFilter: InternalDashboardDateFilterSchema.optional(),
  customFiltersEnabled: z.boolean().optional(),
  sections: z.record(z.array(z.any())).optional(),
  newQueries: z.array(z.any()).optional(),
  tenantKeys: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  sectionOrder: z.array(SectionOrderSchema).optional(),
});

// Simple dashboard - aligned with frontend Dashboard.ts Dashboard
export const SimpleDashboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  reports: z.array(z.any()).default([]),
});

// Dashboard for CLI storage (local files)
export const DashboardStorageSchema = z.object({
  id: z.string(),
  name: z.string(),
  globalFilters: z.array(z.object({
    id: z.string(),
    type: z.enum(['date_range', 'enum', 'string', 'number', 'select', 'multiselect', 'tenant']),
    field: z.string(),
    label: z.string().optional(),
    default: z.any().optional(),
    allowedValues: z.array(z.any()).optional(),
    table: z.string().optional(),
  })).default([]),
  reportIds: z.array(z.string()).default([]),
  layout: z.record(z.any()).optional(),
  sections: z.record(z.array(z.string())).optional(),
  sectionOrder: z.array(SectionOrderSchema).optional(),
  tenantKeys: z.array(z.string()).optional(),
  updatedAt: z.string().datetime(),
  revision: z.number(),
});

// Dashboard creation input
export const DashboardCreateInputSchema = z.object({
  name: z.string().min(1, 'Dashboard name is required'),
  globalFilters: z.array(z.object({
    id: z.string().optional(),
    type: z.enum(['date_range', 'enum', 'string', 'number', 'select', 'multiselect', 'tenant']),
    field: z.string(),
    label: z.string().optional(),
    default: z.any().optional(),
    allowedValues: z.array(z.any()).optional(),
    table: z.string().optional(),
  })).optional(),
  layout: z.record(z.any()).optional(),
  tenantKeys: z.array(z.string()).optional(),
});

// Dashboard update input
export const DashboardUpdateInputSchema = DashboardCreateInputSchema.partial();

// Dashboard filter update input
export const DashboardFiltersUpdateSchema = z.object({
  globalFilters: z.array(z.object({
    id: z.string(),
    type: z.enum(['date_range', 'enum', 'string', 'number', 'select', 'multiselect', 'tenant']),
    field: z.string(),
    label: z.string().optional(),
    default: z.any().optional(),
    allowedValues: z.array(z.any()).optional(),
    table: z.string().optional(),
  })),
});

// Section order update input
export const SectionOrderUpdateSchema = z.object({
  sectionOrder: z.array(SectionOrderSchema),
});

// Types
export type SectionOrder = z.infer<typeof SectionOrderSchema>;
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
export type SimpleDashboard = z.infer<typeof SimpleDashboardSchema>;
export type DashboardStorage = z.infer<typeof DashboardStorageSchema>;
export type DashboardCreateInput = z.infer<typeof DashboardCreateInputSchema>;
export type DashboardUpdateInput = z.infer<typeof DashboardUpdateInputSchema>;
export type DashboardFiltersUpdate = z.infer<typeof DashboardFiltersUpdateSchema>;
export type SectionOrderUpdate = z.infer<typeof SectionOrderUpdateSchema>;
