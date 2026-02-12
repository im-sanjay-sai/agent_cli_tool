import { z } from 'zod';

// Aggregation types - aligned with frontend Pivot.ts
export const AggregationTypeSchema = z.enum([
  'sum',
  'average',
  'min',
  'max',
  'count',
  'avg',
  'percentage',
]);

// Base pivot fields shared between single and multi aggregation
const BasePivotSchema = z.object({
  rowField: z.string().optional(),
  rowFieldType: z.string().optional(),
  columnField: z.string().optional(),
  columnFieldType: z.string().optional(),
  sort: z.boolean().optional(),
  sortDirection: z.enum(['ASC', 'DESC']).optional(),
  sortField: z.string().optional(),
  sortFieldType: z.string().optional(),
  title: z.string().optional(),
  triggerButtonText: z.string().optional(),
  rowLimit: z.number().optional(),
  columnValues: z.array(z.string()).optional(),
});

// Aggregation item for multi-aggregation pivot
export const PivotAggregationSchema = z.object({
  valueField: z.string().optional(),
  valueFieldType: z.string().optional(),
  valueField2: z.string().optional(),
  valueField2Type: z.string().optional(),
  aggregationType: AggregationTypeSchema,
});

// Single aggregation pivot
export const SingleAggregationPivotSchema = BasePivotSchema.extend({
  aggregationType: AggregationTypeSchema,
  valueField: z.string().optional(),
  valueField2: z.string().optional(),
  valueField2Type: z.string().optional(),
  valueFieldType: z.string().optional(),
});

// Multi aggregation pivot
export const MultiAggregationPivotSchema = BasePivotSchema.extend({
  aggregations: z.array(PivotAggregationSchema),
});

// Pivot can be either single or multi aggregation
export const PivotSchema = z.union([
  SingleAggregationPivotSchema,
  MultiAggregationPivotSchema,
]);

// Pivot info returned from API
export const PivotInfoSchema = z.object({
  pivot: PivotSchema,
  possibleRowFields: z.array(z.string()),
  possibleColumnFields: z.array(z.string()),
  possibleValueFields: z.array(z.string()),
});

// Pivot data returned from execution
export const PivotDataSchema = z.object({
  rows: z.array(z.record(z.any())),
  columns: z.array(z.any()),
  rowCount: z.number(),
  pivotQuery: z.string(),
  comparisonPivotQuery: z.string().optional(),
});

// Types
export type AggregationType = z.infer<typeof AggregationTypeSchema>;
export type PivotAggregation = z.infer<typeof PivotAggregationSchema>;
export type SingleAggregationPivot = z.infer<typeof SingleAggregationPivotSchema>;
export type MultiAggregationPivot = z.infer<typeof MultiAggregationPivotSchema>;
export type Pivot = z.infer<typeof PivotSchema>;
export type PivotInfo = z.infer<typeof PivotInfoSchema>;
export type PivotData = z.infer<typeof PivotDataSchema>;
