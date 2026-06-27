'use strict';

const { Notification } = require('../models/Notification');
const Product = require('../models/Product');
const logger = require('../config/logger');
const { emitToCompany } = require('../socket');

/**
 * Create and send a notification
 */
exports.createNotification = async ({ company, type, title, message, recipients, referenceType, referenceId, actionUrl, channels = ['in_app'] }) => {
  try {
    const notification = await Notification.create({
      company,
      type,
      title,
      message,
      recipients: Array.isArray(recipients) ? recipients.map(r => ({ user: r })) : [],
      referenceType,
      referenceId,
      actionUrl,
      channel: channels,
      isSent: true,
      sentAt: new Date()
    });
    
    // Real-time in-app notification
    if (Array.isArray(recipients)) {
      recipients.forEach(userId => {
        emitToCompany(company, 'notification:new', {
          _id: notification._id,
          title,
          message,
          type,
          createdAt: notification.createdAt,
          actionUrl
        }, userId?.toString());
      });
    }
    
    return notification;
  } catch (err) {
    logger.error('Create notification error:', err);
    return null;
  }
};

/**
 * Check and send low stock alert
 */
exports.checkLowStock = async (companyId, productId) => {
  try {
    const product = await Product.findById(productId)
      .select('name sku currentStock reorderLevel company');
    
    if (!product) return;
    
    if (product.currentStock <= product.reorderLevel && product.reorderLevel > 0) {
      // Check if notification already sent recently (last 24 hours)
      const recentNotif = await Notification.findOne({
        company: companyId,
        type: 'low_stock',
        referenceId: productId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });
      
      if (recentNotif) return; // Already notified
      
      // Get company admins/inventory managers
      const User = require('../models/User');
      const managers = await User.find({
        company: companyId,
        isActive: true,
        customRole: { $in: ['admin', 'inventory_manager', 'company_owner'] }
      }).select('_id');
      
      await exports.createNotification({
        company: companyId,
        type: product.currentStock === 0 ? 'out_of_stock' : 'low_stock',
        title: product.currentStock === 0 ? `Out of Stock: ${product.name}` : `Low Stock Alert: ${product.name}`,
        message: `${product.name} (${product.sku}) is ${product.currentStock === 0 ? 'out of stock' : `low (${product.currentStock} remaining, reorder level: ${product.reorderLevel})`}.`,
        recipients: managers.map(u => u._id),
        referenceType: 'Product',
        referenceId: productId,
        actionUrl: `/inventory/products/${productId}`,
        channels: ['in_app', 'email']
      });
      
      logger.info(`Low stock notification sent for product ${product.name}`);
    }
  } catch (err) {
    logger.error('checkLowStock error:', err);
  }
};

/**
 * Send payment received notification
 */
exports.notifyPaymentReceived = async (companyId, customerId, amount, invoiceNumber) => {
  try {
    const User = require('../models/User');
    const managers = await User.find({ company: companyId, isActive: true, customRole: { $in: ['admin', 'accountant', 'company_owner'] } }).select('_id');
    
    await exports.createNotification({
      company: companyId,
      type: 'payment_received',
      title: 'Payment Received',
      message: `Payment of ₹${amount} received for Invoice #${invoiceNumber}`,
      recipients: managers.map(u => u._id),
      referenceType: 'Invoice',
      actionUrl: `/sales/invoices?search=${invoiceNumber}`,
      channels: ['in_app']
    });
  } catch (err) {
    logger.error('Payment notification error:', err);
  }
};

/**
 * Send overdue invoice notifications
 */
exports.sendOverdueNotifications = async () => {
  try {
    const Invoice = require('../models/Invoice');
    const now = new Date();
    
    const overdueInvoices = await Invoice.find({
      paymentStatus: { $in: ['unpaid', 'partial'] },
      dueDate: { $lt: now },
      status: 'active'
    }).populate('customer', 'name email phone').limit(100);
    
    for (const invoice of overdueInvoices) {
      await Invoice.findByIdAndUpdate(invoice._id, { paymentStatus: 'overdue' });
      
      logger.info(`Marked invoice ${invoice.invoiceNumber} as overdue`);
    }
    
    logger.info(`Processed ${overdueInvoices.length} overdue invoices`);
  } catch (err) {
    logger.error('Overdue notification error:', err);
  }
};

/**
 * Check and send warranty expiry alerts
 */
exports.checkWarrantyExpiry = async () => {
  try {
    const { Serial } = require('../models/Inventory');
    const User = require('../models/User');
    const now = new Date();
    // Notify if warranty expires in the next 30 days
    const nextMonth = new Date();
    nextMonth.setDate(now.getDate() + 30);

    const expiringSerials = await Serial.find({
      warrantyExpiry: { $gt: now, $lte: nextMonth },
      status: 'sold'
    }).populate('product customer company');

    for (const serial of expiringSerials) {
      if (!serial.customer || !serial.company) continue;
      
      // Notify managers
      const managers = await User.find({ company: serial.company._id, isActive: true, customRole: { $in: ['admin', 'company_owner', 'support'] } }).select('_id');
      
      await exports.createNotification({
        company: serial.company._id,
        type: 'warranty_expiry',
        title: 'Warranty Expiring Soon',
        message: `Warranty for ${serial.product?.name} (SN: ${serial.serialNumber}) sold to ${serial.customer?.name} expires on ${serial.warrantyExpiry.toDateString()}.`,
        recipients: managers.map(u => u._id),
        referenceType: 'Serial',
        referenceId: serial._id,
        channels: ['in_app']
      });
    }

    logger.info(`Processed ${expiringSerials.length} warranty expiry notifications`);
  } catch (err) {
    logger.error('Warranty expiry notification error:', err);
  }
};

