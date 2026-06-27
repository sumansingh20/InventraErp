'use strict';

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/database');
const connectRedis = require('./config/redis');
const logger = require('./config/logger');
const { setupSocketIO } = require('./socket');
const { initBullQueues } = require('./jobs');
const { globalErrorHandler, notFoundHandler } = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./routes/auth.routes');
const { companyRouter: companyRoutes } = require('./routes/company.routes');
const { branchRouter: branchRoutes } = require('./routes/company.routes');
const { warehouseRouter: warehouseRoutes } = require('./routes/company.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const purchaseRoutes = require('./routes/purchase.routes');
const salesRoutes = require('./routes/sales.routes');
const invoiceRoutes = require('./routes/invoice.routes');
const { paymentRouter: paymentRoutes } = require('./routes/pos.routes');
const accountingRoutes = require('./routes/accounting.routes');
const customerRoutes = require('./routes/customer.routes');
const supplierRoutes = require('./routes/supplier.routes');
const { posRouter: posRoutes } = require('./routes/pos.routes');
const crmRoutes = require('./routes/crm.routes');
const hrmsRoutes = require('./routes/hrms.routes');
const manufacturingRoutes = require('./routes/manufacturing.routes');
const { reportRouter: reportRoutes } = require('./routes/stubs');
const { notificationRouter: notificationRoutes } = require('./routes/pos.routes');
const uploadRoutes = require('./routes/upload.routes');
const { superAdminRouter: superAdminRoutes } = require('./routes/pos.routes');
const { settingRouter: settingRoutes } = require('./routes/stubs');
const dashboardRoutes = require('./routes/dashboard.routes');

const { documentRouter: documentRoutes } = require('./routes/stubs');
const { serviceRouter: serviceRoutes } = require('./routes/stubs');
const { expenseRouter: expenseRoutes } = require('./routes/stubs');
const { gstRouter: gstRoutes } = require('./routes/pos.routes');
const userRoutes = require('./routes/user.routes');

// ─── Phase 2 ECOS Routes ──────────────────────────────────────────────────────
const automationRoutes = require('./routes/automation.routes');
const searchRoutes = require('./routes/search.routes');
const aiRoutes = require('./routes/ai.routes');
const returnRoutes = require('./routes/return.routes');
const serviceRecordRoutes = require('./routes/service-record.routes');
const assetRoutes = require('./routes/asset.routes');
const deliveryRoutes = require('./routes/delivery.routes');

// ─── Phase 3+ InventraX Routes ────────────────────────────────────────────────────
const barcodeRoutes = require('./routes/barcode.routes');
const supplyChainRoutes = require('./routes/supply-chain.routes');
const marketplaceRoutes = require('./routes/marketplace.routes');
const securityRoutes = require('./routes/security.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const warehouseTwinRoutes = require('./routes/warehouse-twin.routes');



const app = express();
const server = http.createServer(app);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Company-ID', 'X-Branch-ID']
}));

// ─── General Middleware ────────────────────────────────────────────────────────
app.use(compression());
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api/v1/auth', rateLimiter.auth);
app.use('/api/v1', rateLimiter.api);

// ─── API Routes ───────────────────────────────────────────────────────────────
const API = '/api/v1';

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/super-admin`, superAdminRoutes);
app.use(`${API}/companies`, companyRoutes);
app.use(`${API}/branches`, branchRoutes);
app.use(`${API}/warehouses`, warehouseRoutes);
app.use(`${API}/products`, productRoutes);
app.use(`${API}/categories`, categoryRoutes);
app.use(`${API}/inventory`, inventoryRoutes);
app.use(`${API}/purchases`, purchaseRoutes);
app.use(`${API}/sales`, salesRoutes);
app.use(`${API}/invoices`, invoiceRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/accounting`, accountingRoutes);
app.use(`${API}/customers`, customerRoutes);
app.use(`${API}/suppliers`, supplierRoutes);
app.use(`${API}/pos`, posRoutes);
app.use(`${API}/crm`, crmRoutes);
app.use(`${API}/hrms`, hrmsRoutes);
app.use(`${API}/manufacturing`, manufacturingRoutes);
app.use(`${API}/reports`, reportRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/uploads`, uploadRoutes);
app.use(`${API}/settings`, settingRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/barcodes`, barcodeRoutes);
app.use(`${API}/documents`, documentRoutes);
app.use(`${API}/services`, serviceRoutes);
app.use(`${API}/expenses`, expenseRoutes);
app.use(`${API}/gst`, gstRoutes);
app.use(`${API}/users`, userRoutes);

// ─── Phase 2 ECOS APIs ────────────────────────────────────────────────────────
app.use(`${API}/automation`, automationRoutes);
app.use(`${API}/search`, searchRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/returns`, returnRoutes);
app.use(`${API}/service-records`, serviceRecordRoutes);
app.use(`${API}/assets`, assetRoutes);
app.use(`${API}/deliveries`, deliveryRoutes);

// ─── Phase 3+ InventraX APIs ────────────────────────────────────────────────────────
app.use(`${API}/barcode`, barcodeRoutes);
app.use(`${API}/supply-chain`, supplyChainRoutes);
app.use(`${API}/marketplace`, marketplaceRoutes);
app.use(`${API}/security`, securityRoutes);
app.use(`${API}/analytics`, analyticsRoutes);
app.use(`${API}/warehouse-twin`, warehouseTwinRoutes);



// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Inventra Enterprise ERP',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV
  });
});

// ─── Frontend SPA Fallback ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
  }
});

// ─── Error Handlers ───────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────
async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();
    logger.info('✅ MongoDB connected');

    // Connect to Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Setup Socket.io
    setupSocketIO(server);
    logger.info('✅ Socket.IO initialized');

    // Initialize Bull queues
    initBullQueues();
    logger.info('✅ Bull queues initialized');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🚀 Inventra ERP Server running on port ${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🌐 API: http://localhost:${PORT}/api/v1`);
      logger.info(`❤️  Health: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Start the server if not running on Vercel
if (!process.env.VERCEL) {
  startServer();
} else {
  // Connect DB in serverless environment
  connectDB().catch(err => logger.error('Vercel MongoDB connect error:', err));
}

// Vercel serverless requires exporting the app
module.exports = app;

