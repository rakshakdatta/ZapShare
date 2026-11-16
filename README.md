# ZapShare

Send files directly between browsers on the same Wi-Fi network or hotspot. Open ZapShare on both devices, select a nearby receiver or enter its six-digit code, and let the receiver approve the transfer.

![ZapShare sender screen with two files queued and a nearby receiver selected](docs/images/send-desktop.png)

## What it does

- **Local pairing** shows available receivers and offers a six-digit code for manual selection. The receiver reviews the sender, filenames, and sizes before accepting.
- **Direct transfer** sends multiple files in binary chunks over a reliable, ordered WebRTC data channel. Progress, cancellation, and downloads are available in the browser. Supported browsers also offer direct-to-folder saving.
- **Accounts and history** support signup, username or email login, editable display names, and separate Sent and Received views. Each completed transfer records the other party’s display name, each filename and size, and the completion time.

<img src="docs/images/send-mobile.png" alt="ZapShare file queue and nearby devices on a narrow mobile screen" width="340">

## Architecture

```mermaid
flowchart LR
    sender["Sender browser"] <-->|"WebRTC data channel · file bytes"| receiver["Receiver browser"]
    sender <-->|"HTTP and Socket.IO"| host["Express host"]
    receiver <-->|"HTTP and Socket.IO"| host
    host <-->|"Accounts, sessions, transfer metadata"| db[("PostgreSQL")]
```

The **Next.js, React, and Tailwind CSS** frontend runs on port **3005**. The **Node.js, Express, and Socket.IO** backend runs on port **3001**. TypeORM applies the PostgreSQL migrations.

Socket.IO coordinates device discovery, approval, and WebRTC negotiation. The browser transfer protocol uses bounded binary chunks and acknowledgments to control buffering. Once the receiver confirms completion, the server saves one history record that appears in each participant’s account. Passwords are hashed with salted scrypt, and HTTP and signaling share an authenticated session.

## Run locally

Install **Node.js 22 LTS** and have a **PostgreSQL** database available. For a disposable local database, run this from a terminal with Docker.

```bash
docker run -d --name zapshare-db -p 127.0.0.1:5432:5432 -e POSTGRES_DB=zapshare -e POSTGRES_USER=zapshare -e POSTGRES_PASSWORD=zapshare_local_dev postgres:18
```

Copy [the backend environment template](zapshare-backend/.env.example) to `zapshare-backend/.env` and set `DATABASE_URL`. The Docker example uses `postgresql://zapshare:zapshare_local_dev@127.0.0.1:5432/zapshare`. The backend applies its migrations on startup.

If your Windows checkout already has a `.postgresql/data` directory, use its local database instead. From the project root, run this when the database is stopped.

```powershell
$pg = Join-Path (Get-Location) '.postgresql'
& "$pg\bin\pg_ctl.exe" -D "$pg\data" -l "$pg\postgres.log" -w start
```

Start the backend and frontend in separate terminals from the repository root. In Windows PowerShell, use `npm.cmd` for these commands.

```bash
npm --prefix zapshare-backend ci
npm --prefix zapshare-backend run start:dev
```

```bash
npm --prefix zapshare-frontend ci
npm --prefix zapshare-frontend run dev
```

Open [localhost:3005](http://localhost:3005) and choose **Sign up**. To try a transfer on one computer, use a second browser profile or a private window for the receiver. On two devices, open `http://HOST_IP:3005` on both while connected to the same network. The host must be reachable on TCP ports **3005** and **3001**.

The host can run offline after dependency installation and PostgreSQL setup. For large files, **Save to folder** is available in compatible browsers on secure origins such as HTTPS or localhost. Standard downloads assemble the file in browser memory.

## Verification

```bash
npm --prefix zapshare-backend run lint
npm --prefix zapshare-backend run build
npm --prefix zapshare-backend test -- --runInBand
npm --prefix zapshare-frontend run build
```

Set `TEST_DATABASE_URL` to a PostgreSQL test database and run `npm --prefix zapshare-backend run test:e2e -- --runInBand`. The integration tests cover account sessions, password login, profile updates, transfer metadata, and SQLite migration. They create and remove a temporary schema.

The browser flow was exercised in two Chromium sessions, including receiver approval, cancellation, matching file checksums after download, and accessing the same history after logging back in.
