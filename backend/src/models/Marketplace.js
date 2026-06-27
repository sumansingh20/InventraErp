'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * INVENTRA MARKETPLACE ENGINE
 * Unified order model aggregating orders from all sales channels:
 * Amazon, Flipkart, Meesho, Shopify, WooCommerce, custom storefront.
 */

const marketplaceOrderSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },

  // Channel info
  channel: {
    type: String,
    required: true,
    enum: ['amazon', 'flipkart', 'meesho', 'shopify', 'woocommerce', 'custom', 'website', 'app'],
    index: true
  },
  channelOrderId: { type: String, required: true },    // Order ID from marketplace
  channelOrderNumber: String,                           // Human readable order number

  // Normalized order data
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded'],
    default: 'pending',
    index: true
  },

  // Customer info (from marketplace)
  customer: { type: Schema.Types.ObjectId, ref: 'Customer' }, // linked if found
  customerName: String,
  customerPhone: String,
  customerEmail: String,
  shippingAddress: {
    line1: String, line2: String, city: String,
    state: String, pincode: String, country: { type: String, default: 'India' }
  },

  // Items (from marketplace, normalized)
  items: [{
    product: { type: Schema.Types.ObjectId, ref: 'Product' }, // linked if matched
    channelSKU: String,
    channelASIN: String,
    name: String,
    quantity: { type: Number, default: 1 },
    sellingPrice: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  }],

  // Financials
  subtotal: { type: Number, default: 0 },
  discountTotal: { type: Number, default: 0 },
  shippingCharges: { type: Number, default: 0 },
  platformFees: { type: Number, default: 0 },
  taxTotal: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  netPayable: { type: Number, default: 0 }, // after platform fees

  currency: { type: String, default: 'INR' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'cod', 'refunded'], default: 'unpaid' },
  paymentMethod: String,

  // Shipping
  trackingId: String,
  courierPartner: String,
  shippedAt: Date,
  estimatedDelivery: Date,
  deliveredAt: Date,

  // Internal processing
  inventoryDeducted: { type: Boolean, default: false },
  invoiceCreated: { type: Boolean, default: false },
  invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },

  // Sync info
  channelData: { type: Schema.Types.Mixed }, // raw data from channel
  lastSyncedAt: Date,
  syncStatus: { type: String, enum: ['pending', 'synced', 'error'], default: 'pending' },
  syncError: String,

  orderDate: Date,
  tags: [String],
  notes: String
}, { timestamps: true });

marketplaceOrderSchema.index({ company: 1, channel: 1, channelOrderId: 1 }, { unique: true });
marketplaceOrderSchema.index({ company: 1, status: 1 });
marketplaceOrderSchema.index({ company: 1, channel: 1, createdAt: -1 });

const MarketplaceOrder = mongoose.model('MarketplaceOrder', marketplaceOrderSchema);

// ─── Marketplace Listing ──────────────────────────────────────────────────────
const marketplaceListingSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },

  channel: {
    type: String,
    required: true,
    enum: ['amazon', 'flipkart', 'meesho', 'shopify', 'woocommerce', 'website', 'app'],
    index: true
  },

  // Channel-specific identifiers
  channelSKU: String,
  channelASIN: String,
  channelListingId: String,
  channelURL: String,

  // Pricing on this channel
  channelPrice: { type: Number, default: 0 },
  mrp: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  commissionRate: { type: Number, default: 0 }, // % platform takes

  // Stock synced to channel
  channelStock: { type: Number, default: 0 },
  stockSyncedAt: Date,

  // Status on channel
  listingStatus: { type: String, enum: ['active', 'inactive', 'suppressed', 'error', 'pending'], default: 'pending' },

  // Auto-sync settings
  autoSyncPrice: { type: Boolean, default: true },
  autoSyncStock: { type: Boolean, default: true },
  minStock: { type: Number, default: 5 }, // don't go below this on channel

  lastSyncedAt: Date,
  syncError: String,

  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

marketplaceListingSchema.index({ company: 1, product: 1, channel: 1 }, { unique: true });
marketplaceListingSchema.index({ company: 1, channel: 1, listingStatus: 1 });

const MarketplaceListing = mongoose.model('MarketplaceListing', marketplaceListingSchema);

// ─── Channel Connection ───────────────────────────────────────────────────────
const channelConnectionSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  channel: { type: String, required: true, enum: ['amazon', 'flipkart', 'meesho', 'shopify', 'woocommerce', 'website', 'app'] },
  name: String, // display name for this connection
  // Credentials (encrypted in production)
  credentials: { type: Schema.Types.Mixed, select: false },
  storeId: String,
  storeName: String,
  webhookUrl: String,
  isActive: { type: Boolean, default: true },
  lastSyncAt: Date,
  syncStatus: { type: String, enum: ['idle', 'syncing', 'error', 'success'], default: 'idle' },
  syncError: String,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

channelConnectionSchema.index({ company: 1, channel: 1 });
const ChannelConnection = mongoose.model('ChannelConnection', channelConnectionSchema);

module.exports = { MarketplaceOrder, MarketplaceListing, ChannelConnection };
