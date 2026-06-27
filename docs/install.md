# Inventra Enterprise ERP - Installation & Operational Manual

Inventra Enterprise ERP is a multi-tenant, multi-branch, real-time business automation platform designed to manage point of sale, inventory digital twins, general ledger accounting, supply chains, manufacturing, and client relationships.

---

## 1. System Requirements

### Hardware Requirements
- **Server**: 2 Cores CPU, 4 GB RAM, 20 GB SSD storage minimum.
- **Client (POS/WMS)**: Any modern tablet, phone, or laptop with a camera (for scanning) or USB/Bluetooth barcode scanner.

### Software Prerequisites
- **Node.js**: `v18.x` or higher
- **MongoDB**: `v6.x` or higher (with replica set enabled for Transactions support)
- **Redis**: `v7.x` or higher
- **Docker & Docker Compose** (Optional, for containerized installation)

---

## 2. Fast Installation via Docker (Recommended)

1. Clone the repository to your server.
2. Ensure Docker is running.
3. Launch orchestration stack:
   ```bash
   docker-compose up -d --build
   ```
4. Verification:
   - Access web app: `http://localhost/`
   - Access backend health endpoint: `http://localhost/api/health`

---

## 3. Manual Deployment Setup

### Step 1: Install Dependencies
Run the command in both the root and backend directories:
```bash
npm install --legacy-peer-deps
```

### Step 2: Configure Environment Variables
Create `.env` file inside the `backend` folder based on `.env.example`:
```ini
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/inventra_erp
REDIS_URL=redis://127.0.0.1:6379
JWT_SECRET=df0516b2cfd84e8a8b13c7a00f162db8ea5fa879571ff2be201a4ad848e3e4a9
JWT_EXPIRE=24h
```

### Step 3: Run Database Migrations & Seeders
This will generate the primary SuperAdmin account, default roles, system permissions, and initial units.
```bash
cd backend
npm run seed
```
Default Administrator Credentials:
- **Email**: `admin@inventra.com`
- **Password**: `Admin@123`

### Step 4: Run Application
For development:
```bash
npm run dev
```
For production (using PM2):
```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
```

---

## 4. Hardware Integrations

### Universal Barcode Scanners (USB / Bluetooth)
The frontend implements a global key-press listener that intercepts hardware scanner inputs.
- Scanned values are buffered and decoded automatically.
- Ensure the scanner device suffix/termination character is configured as `Enter / Carriage Return`.

### Mobile/Tablet Camera Scan
- Enabled through HTML5 MediaDevices camera capture in PWA.
- Requires HTTPS protocol for mobile devices to allow secure camera permissions.
- Scanned images are processed locally by the PWA engine.

---

## 5. Offline & PWA Capabilities
Inventra ERP is configured as a Progressive Web App (PWA).
- Static assets (stylesheets, icons, bundle libraries, pages) are cached in the browser locally.
- When connection drops, PWA shows an offline indicator while the POS billing interface stays active.
- Offline transactions are queued and synced over Socket.io once the connection is re-established.
