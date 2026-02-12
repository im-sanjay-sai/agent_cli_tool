import { z } from 'zod';

// Filter operators - aligned with frontend Filter.ts
export const StringOperatorSchema = z.enum([
  'is exactly',
  'is not exactly',
  'contains',
  'is',
  'is not',
]);

export const DateOperatorSchema = z.enum([
  'custom',
  'in the last',
  'in the previous',
  'in the current',
  'equal to',
  'not equal to',
  'greater than',
  'less than',
  'greater than or equal to',
  'less than or equal to',
]);

export const NumberOperatorSchema = z.enum([
  'equal to',
  'not equal to',
  'greater than',
  'less than',
  'greater than or equal to',
  'less than or equal to',
]);

export const NullOperatorSchema = z.enum(['is not null', 'is null']);

export const BoolOperatorSchema = z.enum(['equal to', 'not equal to']);

export const TimeUnitSchema = z.enum(['year', 'quarter', 'month', 'week', 'day', 'hour']);

export const FieldTypeSchema = z.enum(['string', 'number', 'date', 'null', 'boolean']);

export const FilterTypeSchema = z.enum(['string', 'date', 'numeric', 'boolean', 'null']);

// Dashboard filter types - aligned with frontend DashboardFilterType
export const DashboardFilterTypeSchema = z.enum(['select', 'multiselect', 'date', 'tenant']);

// Filter option
export const FilterOptionSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
});

// Base dashboard filter
const BaseDashboardFilterSchema = z.object({
  label: z.string(),
  type: DashboardFilterTypeSchema,
});

// Select filter
export const DashboardSingleFilterSchema = BaseDashboardFilterSchema.extend({
  type: z.literal('select'),
  value: z.string(),
  options: z.array(FilterOptionSchema),
});

// Multi-select filter
export const DashboardMultiFilterSchema = BaseDashboardFilterSchema.extend({
  type: z.literal('multiselect'),
  value: z.array(z.string()),
  options: z.array(FilterOptionSchema),
});

// Date filter
export const DashboardDateFilterSchema = BaseDashboardFilterSchema.extend({
  type: z.literal('date'),
  value: z.object({
    presetValue: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })),
});

// Tenant filter
export const DashboardTenantFilterSchema = BaseDashboardFilterSchema.extend({
  type: z.literal('tenant'),
  value: z.union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
    z.null(),
  ]),
  options: z.array(FilterOptionSchema),
});

// Union of all dashboard filter types
export const DashboardFilterSchema = z.discriminatedUnion('type', [
  DashboardSingleFilterSchema,
  DashboardMultiFilterSchema,
  DashboardDateFilterSchema,
  DashboardTenantFilterSchema,
]);

// Internal filter types for queries
export const InternalFilterTypeSchema = z.enum([
  'string-filter',
  'date-filter',
  'date-custom-filter',
  'date-comparison-filter',
  'numeric-filter',
  'null-filter',
  'string-in-filter',
  'boolean-filter',
]);

// Internal dashboard filter types
export const InternalDashboardFilterTypeSchema = z.enum(['string', 'date_range', 'tenant']);

export const StringFilterTypeSchema = z.enum(['default', 'multiselect']);

// Internal dashboard string filter
export const InternalDashboardStringFilterSchema = z.object({
  filterType: z.literal('string'),
  label: z.string(),
  field: z.string(),
  dashboardName: z.string(),
  table: z.string(),
  labelField: z.string(),
  stringFilterType: StringFilterTypeSchema,
  options: z.array(z.record(z.string())).optional(),
  selectedValue: z.string().optional(),
  values: z.array(z.string()).optional(),
  isUserFilter: z.boolean().optional(),
});

// Internal dashboard date filter
export const InternalDashboardDateFilterSchema = z.object({
  filterType: z.literal('date_range'),
  label: z.string(),
  field: z.string(),
  dashboardName: z.string(),
  comparison: z.boolean().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  primaryRange: z.object({
    label: z.string(),
    value: z.string(),
  }).optional(),
  presetOptions: z.array(z.any()).optional(),
  defaultPresetRanges: z.array(z.any()).optional(),
  preset: z.object({
    label: z.string(),
    value: z.string(),
  }).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isUserFilter: z.boolean().optional(),
});

// Internal dashboard tenant filter
export const InternalDashboardTenantFilterSchema = z.object({
  filterType: z.literal('tenant'),
  label: z.string(),
  field: z.string(),
  dashboardName: z.string(),
  multiSelect: z.boolean(),
  options: z.array(FilterOptionSchema).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
  isUserFilter: z.boolean().optional(),
});

// Union of internal dashboard filters
export const InternalDashboardFilterSchema = z.discriminatedUnion('filterType', [
  InternalDashboardStringFilterSchema,
  InternalDashboardDateFilterSchema,
  InternalDashboardTenantFilterSchema,
]);

// Types
export type StringOperator = z.infer<typeof StringOperatorSchema>;
export type DateOperator = z.infer<typeof DateOperatorSchema>;
export type NumberOperator = z.infer<typeof NumberOperatorSchema>;
export type NullOperator = z.infer<typeof NullOperatorSchema>;
export type BoolOperator = z.infer<typeof BoolOperatorSchema>;
export type TimeUnit = z.infer<typeof TimeUnitSchema>;
export type FieldType = z.infer<typeof FieldTypeSchema>;
export type FilterType = z.infer<typeof FilterTypeSchema>;
export type DashboardFilterType = z.infer<typeof DashboardFilterTypeSchema>;
export type FilterOption = z.infer<typeof FilterOptionSchema>;
export type DashboardSingleFilter = z.infer<typeof DashboardSingleFilterSchema>;
export type DashboardMultiFilter = z.infer<typeof DashboardMultiFilterSchema>;
export type DashboardDateFilter = z.infer<typeof DashboardDateFilterSchema>;
export type DashboardTenantFilter = z.infer<typeof DashboardTenantFilterSchema>;
export type DashboardFilter = z.infer<typeof DashboardFilterSchema>;
export type InternalDashboardFilter = z.infer<typeof InternalDashboardFilterSchema>;
