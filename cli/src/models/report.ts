import { z } from 'zod';
import { PivotSchema } from './pivot.js';

// Axis format - aligned with frontend Chart.ts
export const AxisFormatSchema = z.enum([
  'percent',
  'dollar_amount',
  'dollar_cents',
  'whole_number',
  'one_decimal_place',
  'two_decimal_places',
  'percentage',
  'string',
  'yyyy',
  'MMM_dd',
  'MMM_yyyy',
  'MMM_dd_yyyy',
  'hh_ap_pm',
  'MMM_dd-MMM_dd',
  'MMM_dd_hh:mm_ap_pm',
  'wo, yyyy',
]);

// Chart types commonly used
export const ChartTypeSchema = z.enum([
  'bar',
  'line',
  'area',
  'table',
  'metric',
  'pie',
  'column',
  'gauge',
  'scatter',
  'funnel',
]);

// Column definition
export const ColumnSchema = z.object({
  field: z.string(),
  displayName: z.string().optional(),
  fieldType: z.string().optional(),
  format: AxisFormatSchema.optional(),
});

// Y-axis field definition
export const YAxisFieldSchema = z.object({
  field: z.string(),
  label: z.string(),
  format: AxisFormatSchema,
});

// Date field definition
export const DateFieldSchema = z.object({
  table: z.string(),
  field: z.string(),
});

// Filter map entry
export const FilterMapEntrySchema = z.object({
  table: z.string(),
  field: z.string(),
});

// Report parameter (for dashboard filter binding)
export const ReportParamSchema = z.object({
  name: z.string(),
  type: z.enum(['date', 'string', 'number', 'boolean']),
  source: z.string().optional(), // e.g., 'dashboardFilter:date_range'
  default: z.any().optional(),
});

// Pagination config
export const PaginationSchema = z.object({
  currentPage: z.number(),
  rowsPerPage: z.number(),
  totalPages: z.number().optional(),
});

// Sort config
export const SortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc', 'ASC', 'DESC']),
});

// Reference line
export const ReferenceLineSchema = z.object({
  label: z.string(),
  query: z.union([z.tuple([z.number(), z.number()]), z.string()]),
});

// QuillReport - aligned with frontend Report.ts
export const QuillReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  dashboardName: z.string(),
  rows: z.array(z.record(z.string())).default([]),
  columns: z.array(ColumnSchema).default([]),
  chartType: z.string(),
  showLegend: z.boolean().optional(),
  dateField: DateFieldSchema.optional(),
  pivot: PivotSchema.nullable(),
  xAxisLabel: z.string().default(''),
  xAxisField: z.string().default(''),
  xAxisFormat: AxisFormatSchema.default('string'),
  template: z.boolean().optional(),
  yAxisFields: z.array(YAxisFieldSchema).default([]),
  order: z.number().default(0),
  compareRows: z.array(z.record(z.string())).default([]),
  filtersApplied: z.array(z.any()).optional(),
  pagination: PaginationSchema.optional(),
  sort: SortSchema.optional(),
  rowCount: z.number().default(0),
  queryString: z.string().default(''),
  filterMap: z.record(FilterMapEntrySchema).optional(),
  referenceLines: z.array(ReferenceLineSchema).optional(),
  includeCustomFields: z.boolean().optional(),
  pivotRows: z.array(z.record(z.string())).optional(),
  pivotColumns: z.array(z.any()).optional(),
  pivotRowCount: z.number().optional(),
});

// Report for CLI storage (simpler, for local files)
export const ReportConfigSchema = z.object({
  id: z.string(),
  dashboardId: z.string(),
  name: z.string(),
  baseSql: z.string(),
  chartType: z.string(),
  params: z.array(ReportParamSchema).default([]),
  formatting: z.object({
    xAxisLabel: z.string().optional(),
    xAxisFormat: AxisFormatSchema.optional(),
    yAxisFields: z.array(YAxisFieldSchema).optional(),
    showLegend: z.boolean().optional(),
  }).optional(),
  pivot: PivotSchema.nullable().default(null),
  dateField: DateFieldSchema.optional(),
  filterMap: z.record(FilterMapEntrySchema).optional(),
  order: z.number().default(0),
  updatedAt: z.string().datetime(),
  revision: z.number(),
});

// Report creation input
export const ReportCreateInputSchema = z.object({
  name: z.string().min(1, 'Report name is required'),
  baseSql: z.string().min(1, 'SQL query is required'),
  chartType: z.string().default('table'),
  params: z.array(ReportParamSchema).optional(),
  formatting: z.object({
    xAxisLabel: z.string().optional(),
    xAxisFormat: AxisFormatSchema.optional(),
    yAxisFields: z.array(YAxisFieldSchema).optional(),
    showLegend: z.boolean().optional(),
  }).optional(),
  columns: z.array(ColumnSchema).optional(),
  pivot: PivotSchema.nullable().optional(),
  dateField: DateFieldSchema.optional(),
  filterMap: z.record(FilterMapEntrySchema).optional(),
  order: z.number().optional(),
});

// Types
export type AxisFormat = z.infer<typeof AxisFormatSchema>;
export type ChartType = z.infer<typeof ChartTypeSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type YAxisField = z.infer<typeof YAxisFieldSchema>;
export type DateField = z.infer<typeof DateFieldSchema>;
export type FilterMapEntry = z.infer<typeof FilterMapEntrySchema>;
export type ReportParam = z.infer<typeof ReportParamSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type Sort = z.infer<typeof SortSchema>;
export type ReferenceLine = z.infer<typeof ReferenceLineSchema>;
export type QuillReport = z.infer<typeof QuillReportSchema>;
export type ReportConfig = z.infer<typeof ReportConfigSchema>;
export type ReportCreateInput = z.infer<typeof ReportCreateInputSchema>;
