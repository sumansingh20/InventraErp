'use strict';

const Bull = require('bull');
const logger = require('../config/logger');
const notificationService = require('../services/notification.service');

const { getRedisClient } = require('../config/redis');

// Queue instances
const queues = {};

const initBullQueues = () => {
  if (!getRedisClient()) {
    logger.info('Background jobs (Bull queues) are disabled (offline mode)');
    return;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  };
  
  try {
    // ─── Notification Queue ───────────────────────────────────────────────────
    queues.notification = new Bull('notifications', { redis: redisConfig });
    
    queues.notification.process(async (job) => {
      const { type, data } = job.data;
      logger.info(`Processing notification job: ${type}`);
      
      switch (type) {
        case 'low_stock':
          await notificationService.checkLowStock(data.companyId, data.productId);
          break;
        case 'overdue_invoices':
          await notificationService.sendOverdueNotifications();
          break;
        case 'warranty_expiry':
          await notificationService.checkWarrantyExpiry();
          break;
        case 'automation_cycle':
          const automationService = require('../services/automation.service');
          await automationService.runAutomationCycle(data.companyId || null);
          break;
        case 'daily_insights': {
          const auto = require('../services/automation.service');
          await auto.generateSalesForecast(data.companyId);
          await auto.generateCashFlowForecast(data.companyId);
          await auto.rankSuppliers(data.companyId);
          await auto.identifyDeadStock(data.companyId);
          break;
        }
        case 'fraud_detection': {
          const fraudService = require('../services/fraud-detection.service');
          await fraudService.runFraudScan(data.companyId || null);
          break;
        }
        default:
          logger.warn(`Unknown notification type: ${type}`);
      }
    });
    
    queues.notification.on('failed', (job, err) => {
      logger.error(`Notification job ${job.id} failed:`, err);
    });
    
    // ─── Email Queue ──────────────────────────────────────────────────────────
    queues.email = new Bull('emails', { redis: redisConfig });
    
    queues.email.process(async (job) => {
      const emailService = require('../services/email.service');
      const { type, data } = job.data;
      
      switch (type) {
        case 'invoice':
          await emailService.sendInvoiceEmail(data.invoice, data.customer);
          break;
        case 'otp':
          await emailService.sendOTPEmail(data.user, data.otp);
          break;
        default:
          logger.warn(`Unknown email type: ${type}`);
      }
    });
    
    queues.email.on('failed', (job, err) => {
      logger.error(`Email job ${job.id} failed:`, err);
    });
    
    // ─── Report Generation Queue ──────────────────────────────────────────────
    queues.reports = new Bull('reports', { redis: redisConfig });
    
    queues.reports.process(async (job) => {
      logger.info(`Processing report job: ${job.id}`);
      // Report generation logic here
    });
    
    // ─── Scheduled Jobs ────────────────────────────────────────────────────────
    
    // Check overdue invoices daily at midnight
    queues.notification.add(
      { type: 'overdue_invoices', data: {} },
      {
        repeat: { cron: '0 0 * * *' },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    );
    
    // Check warranty expiry daily at 1 AM
    queues.notification.add(
      { type: 'warranty_expiry', data: {} },
      {
        repeat: { cron: '0 1 * * *' },
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    );

    // ─── Automation cycle every 15 minutes ────────────────────────────────────
    queues.notification.add(
      { type: 'automation_cycle', data: {} },
      { repeat: { cron: '*/15 * * * *' }, attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );

    // ─── Generate daily insights at 2 AM ─────────────────────────────────────
    queues.notification.add(
      { type: 'daily_insights', data: {} },
      { repeat: { cron: '0 2 * * *' }, attempts: 3, backoff: { type: 'exponential', delay: 10000 } }
    );

    // ─── Run fraud detection every hour ──────────────────────────────────────
    queues.notification.add(
      { type: 'fraud_detection', data: {} },
      { repeat: { cron: '0 * * * *' }, attempts: 2, backoff: { type: 'exponential', delay: 5000 } }
    );

    logger.info('Bull queues initialized successfully');
  } catch (err) {
    logger.error('Failed to initialize Bull queues:', err.message);
    logger.warn('Continuing without job queues...');
  }
};

/**
 * Add a job to a queue
 */
const addJob = async (queueName, type, data, options = {}) => {
  try {
    if (!queues[queueName]) {
      logger.warn(`Queue ${queueName} not found`);
      return null;
    }
    return await queues[queueName].add({ type, data }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      ...options
    });
  } catch (err) {
    logger.error(`Failed to add job to ${queueName}:`, err);
    return null;
  }
};

module.exports = { initBullQueues, addJob, queues };
