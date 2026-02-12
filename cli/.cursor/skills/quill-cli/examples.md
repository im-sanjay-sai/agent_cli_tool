# Quill CLI JSON Examples

JSON file templates for use with CLI commands.

## Dashboard Configuration

Use with: `quill dashboard create --file dashboard.json`

```json
{
  "name": "Sales Analytics Dashboard",
  "globalFilters": [
    {
      "id": "date_range",
      "type": "date_range",
      "field": "created_at",
      "label": "Date Range",
      "table": "orders"
    },
    {
      "id": "region",
      "type": "select",
      "field": "region",
      "label": "Region",
      "table": "customers",
      "allowedValues": ["North America", "Europe", "Asia Pacific", "Latin America"]
    },
    {
      "id": "product_category",
      "type": "multiselect",
      "field": "category",
      "label": "Product Category",
      "table": "products"
    }
  ],
  "layout": {
    "columns": 2,
    "rows": "auto"
  },
  "tenantKeys": ["org_id"]
}
```

### Dashboard Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `globalFilters` | array | No | Filters shared across all reports |
| `layout` | object | No | Grid layout configuration |
| `tenantKeys` | array | No | Multi-tenant isolation fields |

---

## Report Configuration (Basic)

Use with: `quill report create --dashboard <id> --file report.json`

```json
{
  "name": "Revenue by Day",
  "baseSql": "SELECT DATE(o.created_at) as day, SUM(o.total_amount) as revenue, COUNT(*) as order_count FROM orders o WHERE o.status = 'completed' GROUP BY DATE(o.created_at) ORDER BY day DESC",
  "chartType": "line",
  "params": [
    {
      "name": "start_date",
      "type": "date",
      "source": "dashboardFilter:date_range"
    },
    {
      "name": "region",
      "type": "string",
      "source": "dashboardFilter:region"
    }
  ],
  "formatting": {
    "xAxisLabel": "Date",
    "xAxisFormat": "MMM_dd",
    "yAxisFields": [
      {
        "field": "revenue",
        "label": "Revenue",
        "format": "dollar_amount"
      },
      {
        "field": "order_count",
        "label": "Orders",
        "format": "whole_number"
      }
    ],
    "showLegend": true
  },
  "pivot": null,
  "dateField": {
    "table": "orders",
    "field": "created_at"
  },
  "order": 1
}
```

### Report Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Display name |
| `baseSql` | string | Yes | - | SQL query for data |
| `chartType` | string | No | `"table"` | Chart type (see Format Reference below) |
| `params` | array | No | `[]` | Parameters linked to dashboard filters |
| `formatting` | object | No | - | Axis labels and formatting |
| `pivot` | object/null | No | `null` | Pivot configuration (null for no pivot) |
| `dateField` | object | No | - | Primary date field for filtering |
| `filterMap` | object | No | - | Map filter fields to tables |
| `order` | number | No | `0` | Display order in dashboard |

---

## Report Configuration (Minimal)

Only `name` and `baseSql` are required. Everything else has defaults.

Use with: `quill report create --dashboard <id> --file report.json`

```json
{
  "name": "My Report",
  "baseSql": "SELECT * FROM orders LIMIT 100"
}
```

`chartType` defaults to `"table"`. All other fields (`params`, `formatting`, `pivot`, `dateField`, `filterMap`, `order`) are optional.

---

## Report with Pivot Configuration

Use with: `quill report create --dashboard <id> --file report-with-pivot.json`

```json
{
  "name": "Revenue by Product Category and Month",
  "baseSql": "SELECT DATE_TRUNC('month', o.created_at) as month, p.category, SUM(oi.quantity * oi.unit_price) as revenue FROM orders o JOIN order_items oi ON o.id = oi.order_id JOIN products p ON oi.product_id = p.id WHERE o.status = 'completed' GROUP BY DATE_TRUNC('month', o.created_at), p.category ORDER BY month, category",
  "chartType": "column",
  "params": [
    {
      "name": "start_date",
      "type": "date",
      "source": "dashboardFilter:date_range"
    }
  ],
  "formatting": {
    "xAxisLabel": "Month",
    "xAxisFormat": "MMM_yyyy",
    "yAxisFields": [
      {
        "field": "revenue",
        "label": "Revenue",
        "format": "dollar_amount"
      }
    ],
    "showLegend": true
  },
  "pivot": {
    "rowField": "month",
    "rowFieldType": "date",
    "columnField": "category",
    "columnFieldType": "string",
    "aggregationType": "sum",
    "valueField": "revenue",
    "sort": true,
    "sortDirection": "ASC",
    "sortField": "month"
  },
  "dateField": {
    "table": "orders",
    "field": "created_at"
  },
  "order": 2
}
```

### Pivot Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rowField` | string | Yes | Field for row headers |
| `rowFieldType` | string | Yes | `date`, `string`, `number` |
| `columnField` | string | Yes | Field for column headers |
| `columnFieldType` | string | Yes | Data type of column field |
| `aggregationType` | string | Yes | `sum`, `avg`, `average`, `count`, `min`, `max`, `percentage` |
| `valueField` | string | Yes | Field to aggregate |
| `sort` | boolean | No | Enable sorting |
| `sortDirection` | string | No | `ASC` or `DESC` |
| `sortField` | string | No | Field to sort by |

---

## Global Filters Configuration

Use with: `quill dashboard set-filters <id> --file filters.json`

```json
{
  "globalFilters": [
    {
      "id": "date_range",
      "type": "date_range",
      "field": "created_at",
      "label": "Date Range",
      "table": "orders",
      "default": {
        "presetValue": "last_30_days"
      }
    },
    {
      "id": "status",
      "type": "multiselect",
      "field": "status",
      "label": "Order Status",
      "table": "orders",
      "allowedValues": ["pending", "processing", "completed", "cancelled", "refunded"]
    },
    {
      "id": "customer_segment",
      "type": "select",
      "field": "segment",
      "label": "Customer Segment",
      "table": "customers",
      "allowedValues": ["Enterprise", "Mid-Market", "SMB", "Consumer"]
    },
    {
      "id": "min_order_value",
      "type": "number",
      "field": "total_amount",
      "label": "Minimum Order Value",
      "table": "orders"
    }
  ]
}
```

### Filter Types

| Type | Description | Extra Fields |
|------|-------------|--------------|
| `date_range` | Date picker with presets | `default.presetValue` |
| `select` | Single selection dropdown | `allowedValues` |
| `multiselect` | Multiple selection | `allowedValues` |
| `number` | Numeric input | - |
| `enum` | Enumerated values | `allowedValues` |
| `string` | Free text filter | - |
| `tenant` | Tenant-scoped filter | - |

### Filter Presets

For `date_range` type, valid `presetValue` options:
- `last_7_days`
- `last_30_days`
- `last_90_days`
- `this_month`
- `last_month`
- `this_year`

---

## Virtual Table Configuration

Use with: `quill vt create --name "..." --sql "..."`

Or create from file:

```json
{
  "name": "orders_enriched",
  "sql": "SELECT o.id as order_id, o.created_at, o.status, o.total_amount, c.id as customer_id, c.name as customer_name, c.email as customer_email, c.segment as customer_segment, c.region, COUNT(oi.id) as item_count, SUM(oi.quantity) as total_quantity FROM orders o JOIN customers c ON o.customer_id = c.id LEFT JOIN order_items oi ON o.id = oi.order_id GROUP BY o.id, o.created_at, o.status, o.total_amount, c.id, c.name, c.email, c.segment, c.region",
  "ownerTenantFields": ["org_id"]
}
```

### Virtual Table Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Virtual table name (used in SQL) |
| `sql` | string | Yes | SQL query defining the table |
| `ownerTenantFields` | array | No | Fields for multi-tenant isolation |

---

## Tenant Mapping Configuration

Use with: `quill tenant validate --file tenant-mapping.json`

```json
{
  "mappings": [
    {
      "id": "org_mapping",
      "tenantField": "org_id",
      "table": "organizations",
      "column": "id",
      "fieldType": "string"
    },
    {
      "id": "team_mapping",
      "tenantField": "team_id",
      "table": "teams",
      "column": "id",
      "fieldType": "number"
    }
  ]
}
```

### Tenant Mapping Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique mapping identifier |
| `tenantField` | string | Yes | Field name used as tenant key |
| `table` | string | Yes | Source table with tenant reference |
| `column` | string | Yes | Column to map against |
| `fieldType` | string | Yes | `string` or `number` |

---

## Promotion Plan Structure

Generated by: `quill promote plan --from staging --to prod --dashboard <id> --out plan.json`

```json
{
  "id": "plan_abc123def456",
  "from": "staging",
  "to": "prod",
  "dashboardId": "dash_sales_analytics",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "operations": [
    {
      "type": "UPSERT_DASHBOARD",
      "id": "dash_sales_analytics",
      "sourceRevision": 5
    },
    {
      "type": "UPSERT_REPORT",
      "id": "rep_revenue_by_day",
      "sourceRevision": 3
    },
    {
      "type": "UPSERT_REPORT",
      "id": "rep_revenue_by_category",
      "sourceRevision": 2
    },
    {
      "type": "UPSERT_VIRTUAL_TABLE",
      "id": "vt_orders_enriched",
      "sourceRevision": 1
    }
  ],
  "conflicts": [
    {
      "type": "REPORT_DASHBOARD_MISMATCH",
      "resourceId": "rep_old_report",
      "message": "Report references dashboard that doesn't exist in prod",
      "resolutions": ["copy_anyway", "skip_report", "manual_fix"]
    }
  ]
}
```

### Operation Types

| Type | Description |
|------|-------------|
| `UPSERT_DASHBOARD` | Create or update dashboard |
| `UPSERT_REPORT` | Create or update report |
| `UPSERT_VIRTUAL_TABLE` | Create or update virtual table |

### Conflict Types

| Type | Description |
|------|-------------|
| `REPORT_DASHBOARD_MISMATCH` | Report references non-existent dashboard |
| `VIRTUAL_TABLE_MISSING` | Report uses missing virtual table |
| `FILTER_MISMATCH` | Filter references non-existent field |

---

## Format Reference

### Chart Types

Default when omitted: `table`

- `table` - Data table (default)
- `line` - Line chart
- `column` - Vertical bar chart
- `bar` - Horizontal bar chart
- `pie` - Pie chart
- `area` - Area chart
- `metric` - Single value display
- `gauge` - Gauge chart
- `scatter` - Scatter plot
- `funnel` - Funnel chart

### Number Formats

Used in `formatting.yAxisFields[].format`:

- `dollar_amount` - Currency with $ symbol (e.g. "$1,234")
- `dollar_cents` - Currency with cents (e.g. "$1,234.56")
- `whole_number` - Integer formatting (e.g. "1,234")
- `one_decimal_place` - One decimal (e.g. "1,234.5")
- `two_decimal_places` - Two decimals (e.g. "1,234.56")
- `percent` - Percent value (e.g. "85%")
- `percentage` - Percentage value (e.g. "85%")
- `string` - Raw string (no formatting)

### Date Formats

Used in `formatting.xAxisFormat`:

- `MMM_dd` - "Jan 15"
- `MMM_yyyy` - "Jan 2024"
- `MMM_dd_yyyy` - "Jan 15, 2024"
- `yyyy` - "2024"
- `hh_ap_pm` - "3 PM"
- `MMM_dd-MMM_dd` - "Jan 15-Jan 21"
- `MMM_dd_hh:mm_ap_pm` - "Jan 15 3:00 PM"
- `wo, yyyy` - "3rd, 2024" (week of year)
