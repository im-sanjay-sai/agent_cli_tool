# CLI vs Frontend Deep Audit Report

Comprehensive analysis of every CLI task compared against the frontend's actual implementation. The frontend (`quill-sql/frontend`) is the source of truth for all Quill SDK task names, metadata field names, and response parsing.

---

## Executive Summary

- **45+ tasks audited** across dashboards, reports, virtual tables, schema, queries, AI, environments, promotions, and tenants
- **7 CRITICAL field name mismatches** where the CLI sends the wrong field name entirely
- **15+ missing fields** that the frontend always sends but the CLI omits
- **3 structural mismatches** where the CLI sends data in the wrong shape
- **1 completely non-functional command** (`pivotai`)

---

## Transport Layer

The CLI's `quillFetch` wrapper (in `client.ts`) auto-injects these fields into every request:

```javascript
metadata: {
  task: options.task,
  clientId: config.clientId,   // from .quill/config.json
  adminMode: true,             // always hardcoded
  ...options.metadata,
}
```

The frontend's React package only auto-injects `task` + `clientId`. The frontend's Admin package also adds `adminMode: true`. The CLI matches the admin pattern.

**Global issue: The CLI never sends `databaseType` or `tenants` on any request.** The frontend sends both on most requests. This affects tenant-scoped queries and SQL dialect selection across ALL commands.

---

## CRITICAL: Field Name Mismatches (server gets empty/wrong data)

These are wrong field names that will cause the server to not receive the intended data:

| Task | CLI Sends | Frontend Sends | Impact |
|------|-----------|---------------|--------|
| `query` (run SQL) | `sql` | `query` | **Query won't execute** -- server looks for `query` field |
| `quillai` (AI query) | `prompt` | `initialQuestion` | **AI gets no prompt** |
| `plsfix` (AI fix) | `query` | `brokenQuery` | **AI gets no SQL to fix** |
| `plsfix` (AI fix) | `error` | `errorMessage` | **AI gets no error message** |
| `magic` (AI generate) | `prompt` | `initialQuestion` | **AI gets no prompt** |
| `magic-edit` (AI edit) | `prompt` | `initialQuestion` | **AI gets no prompt** |
| `magic-edit` (AI edit) | `existingQuery` | `sqlQuery` | **AI gets no existing SQL** |

---

## CRITICAL: Structural Mismatches

### 1. Report Create -- `formatting` sub-object

The CLI nests chart visualization fields inside a `formatting` object:

```javascript
// CLI sends:
{ name, query, chartType, formatting: { xAxisLabel, xAxisFormat, yAxisFields, showLegend } }
```

The frontend sends them at the **top level**:

```javascript
// Frontend sends:
{ name, query, queryString, chartType, xAxisLabel, xAxisFormat, xAxisField, yAxisFields, showLegend, columns, ... }
```

The backend expects top-level fields. The CLI's nested `formatting` object is likely ignored entirely.

### 2. `update-client` -- flat vs nested

CLI sends updates flat: `{ clientId, name, schemaNames, ... }`

Frontend wraps updates in a `client` key: `{ clientId, client: { name, schemaNames, databaseType, ... } }`

The backend expects the `client` wrapper. CLI updates will silently fail.

### 3. `validate-tenant-mapping` -- completely wrong schema

CLI sends: `{ mapping: ... }` (a generic blob)

Frontend sends: `{ query, fromTenantField, toTenantField, clientId }` (specific fields)

This command is non-functional in the CLI.

---

## Dashboard Tasks

### `dashboards` (list)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `clientId` | sent | auto-injected | OK |
| `tenants` | sent | **MISSING** | HIGH -- tenant-scoped clients may see wrong data |

**Response parsing:**
- Frontend reads: `result.data.dashboards` (array of full dashboard objects with `sections`, `filters`, `dateFilter`, etc.)
- CLI reads: `data.dashboards` -- OK after recent fix
- CLI counts reports from `sections` object -- OK after recent fix
- CLI counts filters from `filters` array -- OK after recent fix

### `dashboard` (show single)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `name` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |
| `databaseType` | sent | **MISSING** | HIGH -- wrong SQL dialect |
| `useNewNodeSql` | `true` | `true` | OK |
| `tenants` | sent | **MISSING** | HIGH -- unscoped data |
| `flags` | sent | **MISSING** | MEDIUM |

### `edit-dashboard` (create/update)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `name` | sent | sent | OK |
| `newDashboardName` | **always sent** | only on update | **CRITICAL on create** -- may fail |
| `clientId` | sent | auto-injected | OK |
| `tenantKeys` | sent | sent (when provided) | OK |
| `tenantFilters` | sent | **MISSING** | MEDIUM |
| `filters` | sent | **MISSING on create** | MEDIUM |
| `dateFilter` | sent | **MISSING** | MEDIUM |

**Response parsing:**
- Frontend reads: `response.data.dashboard` (nested under `.dashboard`)
- CLI reads: `response.data` (flat) -- **may return wrapper instead of dashboard object**

### `delete-dashboard`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `name` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |
| `databaseType` | sent | **MISSING** | MEDIUM |

### `set-section-order`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `dashboardName` | sent | sent | OK |
| `sectionOrder` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |

Status: **OK** -- fields match.

---

## Report Tasks

### `create` (create/update report)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `dashboardName` | sent | sent | OK |
| `name` | sent | sent | OK |
| `query` | sent | sent | OK |
| `queryString` | sent | sent | OK |
| `chartType` | sent | sent | OK |
| `pivot` | sent | sent | OK |
| `dateField` | sent | sent | OK |
| `filterMap` | sent | sent | OK |
| `useNewNodeSql` | context-dependent | `true` | OK |
| `columns` | **full column metadata array** | **MISSING** | **CRITICAL** -- no column info on created reports |
| `xAxisField` | top-level | buried in `formatting` | **HIGH** -- backend ignores nested |
| `xAxisFormat` | top-level | buried in `formatting` | **HIGH** |
| `xAxisLabel` | top-level | buried in `formatting` | **HIGH** |
| `yAxisFields` | top-level | buried in `formatting` | **HIGH** |
| `showLegend` | top-level | buried in `formatting` | **HIGH** |
| `referencedTables` | `string[]` | **MISSING** | **CRITICAL** -- tenant subqueries break |
| `referencedColumns` | `{ [table]: string[] }` | **MISSING** | **CRITICAL** |
| `databaseType` | sent | **MISSING** | HIGH |
| `tenants` | sent | **MISSING** | HIGH |
| `section` | sent | **MISSING** | MEDIUM |
| `template` | sent | **MISSING** | LOW |
| `includeCustomFields` | sent | **MISSING** | MEDIUM |
| `referenceLines` | sent | **MISSING** | LOW |

### `report` (execute/run report)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `reportId` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |
| `databaseType` | sent | **MISSING** | HIGH |
| `useNewNodeSql` | `true` | **MISSING** | HIGH |
| `filters` | stripped of `options` field | passed raw | Minor |
| `tenants` | sent | **MISSING** | HIGH |
| `additionalProcessing` | sent (pagination/sort) | **MISSING** | MEDIUM |

### `report-info` (metadata only)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `reportId` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |
| `tenants` | sent | **MISSING** | MEDIUM |

**Response parsing:**
- Frontend reads: `data.report` and `data.filters` (nested fields)
- CLI reads: `response.data` flat -- may return wrapper

### `delete` (report)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `dashboardItemId` | sent | sent | OK |
| `tenants` | sent | **MISSING** | MEDIUM |
| `databaseType` | sent (admin) | **MISSING** | LOW |

### `item` (paginated report fetch)

**Not implemented in CLI at all.** The frontend uses this for server-side pagination, sorting, row-only and row-count-only queries. The CLI cannot paginate report results.

---

## Virtual Table Tasks

### `view` (fetch VT)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `id` | sent | sent | OK |
| `preQueries` | sent (the view SQL) | **MISSING** | HIGH -- server may need this |
| `name` | sent | **MISSING** | Minor |
| `runQueryConfig` | `{ getColumns: true }` | sent | OK |
| `databaseType` | sent | **MISSING** | HIGH |
| `useNewNodeSql` | `true` | `true` | OK |
| `customFieldInfo` | sent | **MISSING** | MEDIUM |

### `view` (edit VT)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `id` | sent | sent | OK |
| `preQueries` | sent | conditional | OK |
| `name` | sent | sent | OK |
| `runQueryConfig` | sent | sent | OK |
| `databaseType` | sent | **MISSING** | HIGH |
| `useNewNodeSql` | `true` | `true` | OK |
| `ownerTenantFields` | sent | sent | OK |
| `customFieldInfo` | sent | **MISSING** | MEDIUM |
| `noCustomerField` | sent | **MISSING** | MEDIUM |

### `view` (delete VT)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `id` | sent | sent | OK |
| `deleted` | `true` | `true` | OK |
| `databaseType` | sent | **MISSING** | MEDIUM |
| `runQueryConfig` | sent | sent | OK |
| `useNewNodeSql` | `true` | `true` | OK |

### `create-virtual-table`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `name` | sent | sent | OK |
| `queryString` | sent | sent | OK |
| `columns` | **actual column data from query result** | **always `undefined`** | **HIGH** -- columns not pre-set |
| `ownerTenantFields` | sent | sent | OK |
| `clientId` | sent | auto-injected | OK |

### `test-view`

Fields match. Both send `{ tables: [tableName] }`. OK.

### `query-view`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `view` | sent | sent | OK |
| `databaseType` | sent | sent | OK |
| `runQueryConfig` | `{ convertDatatypes: true, limitThousand: ... }` | **MISSING** | HIGH -- no datatype conversion, no limit protection |

---

## Schema Tasks

### `schema` (full schema)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `clientId` | sent | auto-injected | OK |
| `removeCustomerField` | `true` | **MISSING** | MEDIUM -- customer field leaks |
| `removeCustomFieldRef` | `true` | **MISSING** | MEDIUM |
| `useNewCustomFields` | `true` | **MISSING** | MEDIUM |
| `tenants` | sent | **MISSING** | HIGH -- no tenant filtering |
| `tableIds` | sent | **MISSING** | LOW |
| `customFieldsByTable` | sent | **MISSING** | MEDIUM |

### `get-schema-names`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `databaseType` | sent | **MISSING** | HIGH -- wrong dialect |

### `tables-by-schema` and `table-info`

Both match. CLI sends the same fields. OK.

### `test-connection`

Matches. Both send `{ connectionString, databaseType }`. OK.

---

## Query Tasks

### `query` (execute raw SQL)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| **Field name for SQL** | `query` | `sql` | **CRITICAL -- wrong field name** |
| `databaseType` | sent | **MISSING** | HIGH |
| `useNewNodeSql` | `true` | **MISSING** | HIGH |
| `tenants` | sent | **MISSING** | HIGH |
| `dashboardName` | sent | **MISSING** | MEDIUM |
| `customFieldsByTable` | sent | **MISSING** | MEDIUM |
| `additionalProcessing` | sent | **MISSING** | MEDIUM |
| `filters` | rich filter objects | simple from JSON | Minor |
| `dateField` | sent | **MISSING** | MEDIUM |
| `filterMap` | sent | **MISSING** | MEDIUM |

### `astify` (parse SQL to AST)

Matches. Both send `{ query, useNewNodeSql: true }`. OK.

### `sqlify` (AST to SQL)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `ast` | sent | sent | OK |
| `useNewNodeSql` | `true` | **MISSING** | MEDIUM |

**Response parsing mismatch:**
- Frontend reads: `data.query`
- CLI reads: `data.sql` -- different field name

---

## AI Tasks

### `quillai` (AI generate SQL from prompt)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| **Prompt field** | `initialQuestion` | `prompt` | **CRITICAL -- wrong field name** |
| `existingQuery` | sent (context) | **MISSING** | MEDIUM |

### `plsfix` (AI fix broken SQL)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| **SQL field** | `brokenQuery` | `query` | **CRITICAL -- wrong field name** |
| **Error field** | `errorMessage` | `error` | **CRITICAL -- wrong field name** |
| `initialQuestion` | sent (context) | **MISSING** | MEDIUM |

### `pivotai` (AI generate pivot config)

**COMPLETELY WRONG.** The CLI and frontend send entirely different payloads:

Frontend sends:
```javascript
{ pivotCountRequest, allowedRowFields, allowedColumnFields, allowedValueFields, tableSchema }
```

CLI sends:
```javascript
{ prompt, reportId }
```

**Response parsing also mismatched:**
- Frontend reads: `data.data.pivotTables` (array of Pivot objects)
- CLI reads: `data.pivot || data`

**This command is non-functional.**

### `magic` (AI generate SQL)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| **Prompt field** | `initialQuestion` | `prompt` | **CRITICAL -- wrong field name** |

**Response parsing:**
- Frontend reads: `data.ast` (AST array)
- CLI reads: `data.message || data.sql` -- different data shape

### `magic-edit` (AI edit existing SQL)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| **Prompt field** | `initialQuestion` | `prompt` | **CRITICAL -- wrong field name** |
| **SQL field** | `sqlQuery` | `existingQuery` | **CRITICAL -- wrong field name** |

### `sql-generator`

Matches. Both send `{ initialQuestion, tableSchemas }`. OK.

### `ai-from-client-schema`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `prompt` | sent | sent | OK |
| `schemaNames` | sent | sent | OK |
| `databaseSchema` | sent (self-hosted) | **MISSING** | MEDIUM for self-hosted |

---

## Environment Tasks

### `environment` (show)

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `clientId` | sent | auto-injected | OK |
| `tenants` | sent | **MISSING** | HIGH |
| `flags` | sent | **MISSING** | MEDIUM |
| `useNewNodeSql` | `true` | **MISSING** | HIGH |
| `skipQueries` | `true` | **MISSING** | MEDIUM |
| `removeCustomerField` | `true` | **MISSING** | MEDIUM |
| `removeCustomFieldRef` | `true` | **MISSING** | MEDIUM |
| `customFieldsByTable` | sent | **MISSING** | MEDIUM |
| `useNewCustomFields` | `true` | **MISSING** | MEDIUM |
| `fetchDashboards` | `true` | **MISSING** | MEDIUM |

**Response parsing:**
- Frontend reads: `result.data.environment.client` (deeply nested)
- CLI reads: `response.data` flat -- **may return wrapper**

### `clients` (list environments)

Mostly OK. Missing `fetchDefaultDashboard` but minor.

### `update-client`

**STRUCTURAL MISMATCH** (see Critical section above). CLI sends flat, frontend wraps in `client` key.

### `delete-client`

Matches. Both send `{ clientId }`. OK.

---

## Promote Tasks

### All promote commands (`promote-dashboard`, `promote-item`, `promote-view`)

**Missing `skipWarning` flow:** The frontend implements a two-step promotion:
1. Call without `skipWarning`
2. If backend returns a warning, prompt user, then retry with `skipWarning: true`

The CLI doesn't implement this at all. Promotions may fail silently when warnings exist.

**`promote-item` (report):** Missing `--auto-resolve` flag in the CLI command (the function supports it but the command doesn't expose it).

---

## Tenant Tasks

### `tenant-mapping`

| Field | Frontend | CLI | Status |
|-------|---------|-----|--------|
| `clientId` | sent | auto-injected | OK |
| `tenants` | **sent (required)** | **MISSING** | **CRITICAL** |
| `dashboardName` | **sent (required)** | **MISSING** | **CRITICAL** |

**Response parsing mismatch:**
- Frontend reads: `data.queryOrder` + `queries.queryResults[]` (complex parsing)
- CLI reads: `data.mappings` -- **field doesn't exist in response**

### `viewer-tenants`

Missing `dashboardName`. Response may be empty.

### `validate-tenant-mapping`

**COMPLETELY WRONG** (see Critical section above). CLI sends `{ mapping }`, backend expects `{ query, fromTenantField, toTenantField }`.

---

## Priority Fix List

### P0 -- Critical (commands broken or produce wrong results)

1. **`query` task: `sql` -> `query`** -- raw SQL execution is broken
2. **`quillai`: `prompt` -> `initialQuestion`** -- AI SQL generation broken
3. **`plsfix`: `query` -> `brokenQuery`, `error` -> `errorMessage`** -- AI fix broken
4. **`magic`: `prompt` -> `initialQuestion`** -- AI magic broken
5. **`magic-edit`: `prompt` -> `initialQuestion`, `existingQuery` -> `sqlQuery`** -- AI edit broken
6. **Report create: flatten `formatting` fields to top-level** -- chart config not applied
7. **Report create: add `referencedTables` and `referencedColumns`** -- tenant scoping breaks
8. **`update-client`: wrap updates in `client` key** -- environment updates fail
9. **`validate-tenant-mapping`: use correct schema** -- command non-functional
10. **`pivotai`: completely rewrite** -- command non-functional

### P1 -- High (degraded functionality)

11. **Add `databaseType` to all relevant requests** -- wrong SQL dialect everywhere
12. **Add `tenants` to requests that need it** -- multi-tenant scoping broken
13. **Add `useNewNodeSql: true` to `query`, `report`, `schema`, `sqlify`** -- legacy code path used
14. **`edit-dashboard` create: add `newDashboardName`** -- creation may fail
15. **Report create: add `columns` array** -- reports have no column metadata
16. **`create-virtual-table`: pass actual columns, not `undefined`**
17. **`query-view`: add `runQueryConfig`** -- no datatype conversion
18. **`get-schema-names`: add `databaseType`** -- wrong dialect
19. **`tenant-mapping`: add `tenants` and `dashboardName`** -- returns empty
20. **`environment`: add missing 9 metadata fields** -- incomplete response

### P2 -- Medium (missing features)

21. Implement `task: 'item'` for paginated report fetching
22. Add `skipWarning` flow to all promote commands
23. Add `--auto-resolve` to `promote report` command
24. Fix `report-info` response parsing (read `data.report` not `data`)
25. Fix `edit-dashboard` response parsing (read `data.dashboard` not `data`)
26. Fix `tenant-mapping` response parsing (use `queryOrder` + `queryResults`)
27. Fix `environment` response parsing (extract from `data.environment`)
28. Fix `sqlify` response reading (`data.query` not `data.sql`)

### P3 -- Low (nice to have)

29. Add `dashnames` task support
30. Add `flags` support
31. Add `customFieldInfo` to VT operations
32. Add `noCustomerField` to VT operations
33. Remove dead code (`fetchMappedTenants` unused)
34. Add `removeCustomerField`/`removeCustomFieldRef` to schema tasks
