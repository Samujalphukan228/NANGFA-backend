# Restaurant Backend System

Backend for the NANGFA ethnic restaurant: menu, orders, staff accounts, a
real-time kitchen/waiter/admin call channel, and a finance module for the
accountant role.

## Tech stack

- Node.js (ES modules) + Express 5
- MongoDB + Mongoose
- Socket.IO (real-time orders and calls)
- JWT authentication, argon2 password hashing

## Getting started

```bash
cd backend
npm install
cp .env.example .env   # then fill in the values
npm run dev            # nodemon
# or
npm start
```

Required environment variables (`backend/.env`):

| Variable | Description |
|---|---|
| `PORT` | HTTP port (defaults to `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign JWTs |
| `ADMIN_EMAIL` | Email of the hard-coded admin account |
| `ADMIN_PASSWORD` | Password of the hard-coded admin account |

The server refuses to start if any of the required variables are missing.

## Modules

- **Auth** – admin login (`.env` account) plus employee register/login/approval.
- **Employees** – admin approves employees as `kitchen`, `waiter` or `accountant`.
- **Menu** – CRUD for menu items and categories.
- **Orders** – create/update/complete/cancel orders, table grouping, revenue reports.
- **Waiter** – waiter-facing order endpoints.
- **Calls** – admin ↔ kitchen and waiter ↔ kitchen WebRTC signaling over Socket.IO.
- **Finance** – categories, daily entries, profit/savings reports.

## Finance module

See [FINANCE_API.md](./FINANCE_API.md) for the full API, formulas and setup.
