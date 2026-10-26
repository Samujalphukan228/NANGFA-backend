# Finance Module API

The finance module lets an **accountant** (or the admin) create spending
categories, record daily money movements, and get daily + cumulative profit,
revenue and savings reports.

Base URL: `/api/finance`

All finance routes require:

```
Authorization: Bearer <token>
```

The token must belong to **the admin** or an **approved & active accountant**.

---

## 1. Formulas

```
Final Sale    = Linked Sale − Sale Adjustments
Final Profit  = Final Sale − Expenses
Savings       = Final Profit − Personal Expense
```

- **Linked Sale** is read automatically from the restaurant revenue
  (`revenueModel`), which is created when an order is completed. It is not
  typed in manually.
- **Sale Adjustments** are finance entries whose category kind is
  `sale_adjustment`.
- **Expenses** are finance entries whose category kind is `expense`.
- **Personal Expense** entries have category kind `personal_expense`.
- **Savings** is the money left after personal spending.
- **Investment** entries (`investment`) and **Other Income** entries (`income`)
  are shown separately and are **not** part of the profit formula. This keeps
  the client's formula exact. Change a category's kind if you want it treated
  differently.

Every report returns the values for the selected day **and** the cumulative
amount from the beginning of the records up to that day.

---

## 2. Category kinds

| Kind | Meaning | Affects |
|---|---|---|
| `expense` | Normal business spending (Gas, Chicken, Salary, …) | Reduces profit |
| `sale_adjustment` | Money removed from the linked sale | Reduces final sale |
| `personal_expense` | Owner/staff personal spending | Reduces savings |
| `investment` | Capital put into / spent on the business | Shown separately |
| `income` | Income that is not restaurant sale | Shown separately |

Payment methods: `cash`, `upi`, `card`, `bank`, `credit`, `other`.

---

## 3. Categories

### Get categories

```
GET /api/finance/categories?kind=expense&includeInactive=false&startDate=2026-10-01&endDate=2026-10-31
```

Each category includes `totalAmount` and `entryCount` (all-time by default, or
inside the supplied date range).

### Create a category

```
POST /api/finance/categories
Content-Type: application/json

{
  "name": "Gas",
  "kind": "expense",
  "description": "Cooking gas",
  "sortOrder": 1
}
```

### Update a category

```
PUT /api/finance/categories/:id

{
  "name": "Gas Cylinder",
  "kind": "expense",
  "isActive": true,
  "description": "Cooking gas refills"
}
```

Renaming a category or changing its kind also updates all its existing entries
so reports stay correct.

### Deactivate instead of delete

```
PUT /api/finance/categories/:id
{ "isActive": false }
```

### Delete a category

```
DELETE /api/finance/categories/:id
```

A category that already has entries cannot be deleted (deactivate it instead).

### Seed the client's default categories

```
POST /api/finance/categories/seed-defaults
```

This is safe to call more than once. It creates:

- **Expenses:** Gas, Vegetable, Gupta Store, SSP Store, Hari Chacha Masala,
  Chicken, Big Fish, Small Fish, Pork, Duck, Tuktuki, Beleg Tuktuki,
  Peha/Bahira Dukan, Glass/Napkin/Packing Pouch/20 L Bottle, Maintenance,
  Electricity, Salary, Other Expense
- **Investment:** New Investment
- **Sale adjustment:** Sale Adjustment
- **Personal:** Personal Expense
- **Other income:** Other Income

---

## 4. Entries (money movements)

### Add one entry

```
POST /api/finance/entries
Content-Type: application/json

{
  "date": "2026-10-26",
  "categoryId": "66f1c2...",
  "amount": 1200,
  "description": "Chicken for evening",
  "itemName": "Chicken 8kg",
  "vendor": "Gupta Store",
  "paymentMethod": "cash",
  "reference": "bill-102"
}
```

`category` can be used instead of `categoryId` and accepts either the category
id or its name:

```json
{ "category": "Gas", "amount": 950, "date": "2026-10-26" }
```

### Add many entries at once

Useful for entering the whole day's spending in one request.

```
POST /api/finance/entries/bulk

{
  "entries": [
    { "date": "2026-10-26", "category": "Gas", "amount": 950 },
    { "date": "2026-10-26", "category": "Vegetable", "amount": 640, "itemName": "Onion, tomato" },
    { "date": "2026-10-26", "category": "Chicken", "amount": 2400 },
    { "date": "2026-10-26", "category": "Sale Adjustment", "amount": 150 }
  ]
}
```

Maximum 500 entries per request.

### List entries

```
GET /api/finance/entries?startDate=2026-10-01&endDate=2026-10-31&kind=expense&categoryId=...&search=chicken&page=1&limit=50
```

Returns paginated entries with their category populated.

### Get / update / delete one entry

```
GET    /api/finance/entries/:id
PUT    /api/finance/entries/:id
DELETE /api/finance/entries/:id
```

### Item names

```
GET /api/finance/items?categoryId=...&kind=expense
```

Returns the distinct `itemName` values already used, with totals. Item names
are optional free text on each entry (example: `"Chicken 8kg"` under the
`Chicken` category).

---

## 5. Reports

### Daily summary (daily + cumulative + month-to-date + 7-day trend)

```
GET /api/finance/summary?date=2026-10-26
```

Response shape:

```json
{
  "success": true,
  "date": "2026-10-26",
  "daily": {
    "linkedSale": 18500,
    "linkedSaleOrders": 42,
    "saleAdjustments": 150,
    "finalSale": 18350,
    "expenses": 6200,
    "finalProfit": 12150,
    "personalExpense": 1000,
    "savings": 11150,
    "investment": 0,
    "otherIncome": 0,
    "entryCount": 12,
    "categoryBreakdown": [
      { "categoryId": "...", "name": "Chicken", "kind": "expense", "amount": 2400, "count": 1 }
    ]
  },
  "cumulative": {
    "linkedSale": 0,
    "saleAdjustments": 0,
    "finalSale": 0,
    "expenses": 0,
    "finalProfit": 0,
    "personalExpense": 0,
    "savings": 0,
    "investment": 0,
    "otherIncome": 0,
    "entryCount": 0,
    "categoryBreakdown": []
  },
  "monthToDate": {},
  "last7Days": []
}
```

`cumulative` covers everything from the first record until the end of the
selected day.

### Daily report only

```
GET /api/finance/daily?date=2026-10-26
```

### Date range report

```
GET /api/finance/summary/range?startDate=2026-10-01&endDate=2026-10-31
```

Returns:

- `range` → totals for the range + category breakdown
- `cumulative` → totals from the beginning through `endDate`
- `days` → a per-day series with the same profit/savings fields

### Metadata

```
GET /api/finance/meta
```

Returns the allowed category kinds, payment methods, formulas and the default
category list. Useful for building the accountant UI.

---

## 6. Creating an accountant account

1. The person registers normally:
   ```
   POST /api/employ/register
   { "name": "Finance User", "email": "accounts@example.com", "password": "secret123" }
   ```
2. The admin opens the employees screen and approves them with role
   **`accountant`**:
   ```
   PUT /api/admin/employees/:id/approve
   { "role": "accountant" }
   ```
3. The accountant logs in with the normal employee login:
   ```
   POST /api/employ/login
   ```
4. The admin can deactivate the accountant from the same employees screen using
   `PUT /api/admin/employees/:id/toggle-active`.

Accountants can only access `/api/finance/*`. They cannot access admin, kitchen
or waiter routes.

---

## 7. Socket events

The server emits these events to the `admin` and `accountant` rooms:

- `finance:category:created`
- `finance:category:updated`
- `finance:category:deleted`
- `finance:categories:seeded`
- `finance:entry:created`
- `finance:entries:created` (bulk)
- `finance:entry:updated`
- `finance:entry:deleted`
