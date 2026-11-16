# ZapShare backend

Node.js and Express serve the HTTP APIs. Socket.IO runs on the same HTTP server and handles live receiver discovery, approval, and WebRTC signaling. TypeORM applies migrations and connects the profile and transfer metadata APIs to PostgreSQL.

## Run locally

Use Node.js 22.13 or newer. See the [ZapShare setup guide](../README.md) for starting the local PostgreSQL instance or creating a database on an existing server.

```powershell
npm.cmd ci
npm.cmd run start:dev
```

Set `DATABASE_URL` in `.env` or in the shell before starting. See `.env.example` for the connection URL format. The server listens on port 3001 by default. For a production build, run `npm.cmd run build` followed by `npm.cmd start`.

The HTTP routes include `/auth` for account creation, login, and logout, and `/device` for the account's display name and history. HTTP and Socket.IO use the same session cookie. The receiver confirms completion before the backend saves one metadata record for both sides.

Use `npm.cmd run import:sqlite -- .\zapshare.db` to import your previous metadata into PostgreSQL. The importer opens the source database read-only and can be rerun safely.

## Tests

```powershell
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
```

The API tests require `TEST_DATABASE_URL` in the shell or in `.env.test`. The PostgreSQL login needs permission to create a temporary schema in that database.
