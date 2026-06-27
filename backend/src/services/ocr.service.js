'use strict';

const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');

/**
 * INVENTRA OCR ENGINE v2
 * Upload any invoice image → Extract supplier, GST, products, quantities, prices, taxes.
 * Auto-creates purchase entry in MongoDB.
 */

// ─── Pattern Library ──────────────────────────────────────────────────────────

const PATTERNS = {
  gstNumber:    /(?:GSTIN?|GST\s*No\.?|GST\s*Number)\s*[:\-]?\s*([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})/gi,
  panNumber:    /(?:PAN\s*(?:No\.?|Number)?\s*[:\-]?)?\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/g,
  invoiceNo:    /(?:Invoice\s*(?:No|Number|#|Num)\.?)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  invoiceDate:  /(?:Date|Invoice\s*Date|Bill\s*Date)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  dueDate:      /(?:Due\s*Date|Payment\s*Due)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  grandTotal:   /(?:Grand\s*Total|Total\s*Amount|Net\s*Payable|Amount\s*Due|Total\s*Due)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i,
  subtotal:     /(?:Sub\s*Total|Subtotal|Total\s*Before\s*Tax)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/i,
  gstAmount:    /(?:GST|IGST|CGST|SGST|Tax\s*Amount)\s*(?:@\s*\d+%\s*)?\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+\.?\d*)/gi,
  hsnCode:      /HSN\s*(?:Code|SAC)?\s*[:\-]?\s*([0-9]{4,8})/gi,
  phoneNumber:  /(?:Phone|Tel|Mobile|Contact)\s*[:\-]?\s*([\+\d\s\-]{10,15})/i,
  emailAddr:    /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/,
  currency:     /(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*)/g,
};

// ─── Text Cleanup ─────────────────────────────────────────────────────────────
const cleanText = (text) => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[^\x20-\x7E\n₹]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const parseAmount = (str) => {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '')) || 0;
};

const parseDate = (str) => {
  if (!str) return new Date();
  try {
    let [p1, p2, p3] = str.split(/[\/\-\.]/);
    if (p3 && p3.length === 2) p3 = '20' + p3;
    // Try DD/MM/YYYY first (Indian standard)
    const dt = new Date(`${p3}-${p2?.padStart(2,'0')}-${p1?.padStart(2,'0')}`);
    return isNaN(dt) ? new Date() : dt;
  } catch { return new Date(); }
};

// ─── Core OCR Processing ──────────────────────────────────────────────────────
exports.processInvoiceImage = async (filePath) => {
  try {
    logger.info('OCR: Starting invoice processing:', path.basename(filePath));

    const { data: { text, confidence } } = await Tesseract.recognize(filePath, 'eng', {
      logger: m => { if (m.progress) logger.debug(`OCR progress: ${Math.round(m.progress * 100)}%`); }
    });

    const cleaned = cleanText(text);
    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 1);

    logger.info(`OCR: Extracted ${lines.length} lines with ${confidence?.toFixed(1)}% confidence`);

    const result = exports.parseInvoiceText(cleaned, lines);
    result.rawText = text;
    result.ocrConfidence = confidence;
    result.sourceFile = path.basename(filePath);

    return result;
  } catch (err) {
    logger.error('OCR processing error:', err);
    throw new Error(`OCR failed: ${err.message}`);
  } finally {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch {}
    }
  }
};

// ─── Parse Extracted Text ─────────────────────────────────────────────────────
exports.parseInvoiceText = (text, lines) => {
  const result = {
    supplierName: '',
    supplierGST: '',
    supplierPhone: '',
    supplierEmail: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: null,
    grandTotal: 0,
    subtotal: 0,
    taxTotal: 0,
    taxBreakdown: [],
    hsnCodes: [],
    items: [],
    notes: '',
    confidence: 'medium',
  };

  // ── Supplier Info ────────────────────────────────────────────────────────
  // First meaningful non-numeric line is likely the vendor name
  const potentialVendors = lines.filter(l =>
    /[A-Za-z]{3,}/.test(l) &&
    !l.match(/invoice|bill|receipt|tax|purchase|order|date|number|total|amount|gstin|pan|hsn|sgst|cgst|igst|page/i) &&
    l.length > 3 && l.length < 80
  );
  result.supplierName = potentialVendors[0] || 'Unknown Supplier';

  // ── GST Number ──────────────────────────────────────────────────────────
  const gstMatches = [...text.matchAll(PATTERNS.gstNumber)];
  if (gstMatches.length > 0) {
    result.supplierGST = gstMatches[0][1].toUpperCase();
    // More GST numbers = buyer GST
    if (gstMatches.length > 1) {
      result.buyerGST = gstMatches[1][1].toUpperCase();
    }
    result.confidence = 'high';
  }

  // ── Invoice Number ──────────────────────────────────────────────────────
  const invNoMatch = text.match(PATTERNS.invoiceNo);
  if (invNoMatch) result.invoiceNumber = invNoMatch[1].trim();

  // ── Dates ────────────────────────────────────────────────────────────────
  const invDateMatch = text.match(PATTERNS.invoiceDate);
  if (invDateMatch) {
    result.invoiceDate = parseDate(invDateMatch[1]).toISOString().split('T')[0];
  }

  const dueDateMatch = text.match(PATTERNS.dueDate);
  if (dueDateMatch) {
    result.dueDate = parseDate(dueDateMatch[1]).toISOString().split('T')[0];
  }

  // ── Amounts ─────────────────────────────────────────────────────────────
  const totalMatch = text.match(PATTERNS.grandTotal);
  if (totalMatch) result.grandTotal = parseAmount(totalMatch[1]);

  const subtotalMatch = text.match(PATTERNS.subtotal);
  if (subtotalMatch) result.subtotal = parseAmount(subtotalMatch[1]);

  // ── Tax Breakdown ────────────────────────────────────────────────────────
  const taxTypes = ['IGST', 'CGST', 'SGST'];
  for (const taxType of taxTypes) {
    const taxRegex = new RegExp(`${taxType}\\s*(?:@\\s*[\\d.]+%)?\\s*[:\\-]?\\s*(?:Rs\\.?|₹)?\\s*([\\d,]+\\.?\\d*)`, 'i');
    const match = text.match(taxRegex);
    if (match) {
      const amt = parseAmount(match[1]);
      result.taxBreakdown.push({ taxType, amount: amt });
      result.taxTotal += amt;
    }
  }

  // ── HSN Codes ────────────────────────────────────────────────────────────
  const hsnMatches = [...text.matchAll(PATTERNS.hsnCode)];
  result.hsnCodes = [...new Set(hsnMatches.map(m => m[1]))];

  // ── Contact Info ─────────────────────────────────────────────────────────
  const phoneMatch = text.match(PATTERNS.phoneNumber);
  if (phoneMatch) result.supplierPhone = phoneMatch[1].trim();

  const emailMatch = text.match(PATTERNS.emailAddr);
  if (emailMatch) result.supplierEmail = emailMatch[1];

  // ── Line Items ────────────────────────────────────────────────────────────
  result.items = exports.extractLineItems(lines);

  // If no items but we have a total, create a catch-all
  if (result.items.length === 0 && result.grandTotal > 0) {
    result.items.push({
      name: 'Invoice Item (Auto-detected)',
      quantity: 1,
      unit: 'PCS',
      purchasePrice: result.subtotal || result.grandTotal,
      taxRate: 18,
      taxAmount: result.taxTotal,
      total: result.grandTotal,
      hsn: result.hsnCodes[0] || ''
    });
  }

  return result;
};

// ─── Extract Line Items ────────────────────────────────────────────────────────
exports.extractLineItems = (lines) => {
  const items = [];
  const skipPatterns = /^(s\.?no|sr\.?|#|invoice|bill|total|sub.?total|grand|tax|gst|igst|cgst|sgst|discount|freight|shipping|amount|balance|net|page|date|gstin|pan|address|phone|email|thank|sincerely|regards)/i;
  const itemPatterns = [
    // Pattern 1: Name  Qty  Rate  Amount (space-separated cols)
    /^(.{3,40}?)\s{2,}(\d+(?:\.\d+)?)\s{1,}(?:PCS|KG|LTR|MTR|NOS|BOX|PKT|SET|PAIR|BAG|CTN)?\s{1,}([\d,]+\.?\d*)\s{1,}([\d,]+\.?\d*)\s*$/i,
    // Pattern 2: Name  Qty  Unit  Rate  Tax%  Amount
    /^(.{3,40}?)\s{2,}(\d+)\s+(PCS|KG|LTR|MTR|NOS|BOX|PKT|BAG|CTN|UNIT|NO)\s+([\d,]+\.?\d*)\s+[\d.]+%?\s+([\d,]+\.?\d*)/i,
    // Pattern 3: Simpler: Name followed by numbers
    /^(.{3,35})\s+(\d{1,5})\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/,
  ];

  for (const line of lines) {
    if (skipPatterns.test(line.trim())) continue;
    if (line.trim().length < 5) continue;

    for (const pattern of itemPatterns) {
      const match = line.match(pattern);
      if (match) {
        const name = match[1].trim();
        const qty = parseFloat(match[2]);
        let rate, total;

        if (pattern === itemPatterns[1]) {
          rate = parseAmount(match[4]);
          total = parseAmount(match[5]);
        } else {
          rate = parseAmount(match[3]);
          total = parseAmount(match[4]);
        }

        if (name.length > 2 && qty > 0 && (rate > 0 || total > 0)) {
          const taxRate = 18; // default GST 18%
          const basePrice = rate || (total / qty) || 0;
          items.push({
            name,
            quantity: qty,
            unit: 'PCS',
            purchasePrice: parseFloat(basePrice.toFixed(2)),
            taxRate,
            taxAmount: parseFloat((basePrice * qty * taxRate / 100).toFixed(2)),
            total: parseFloat((total || basePrice * qty).toFixed(2)),
            hsn: ''
          });
          break;
        }
      }
    }
    if (items.length >= 50) break; // safety cap
  }

  return items;
};

// ─── Auto-Create Purchase Entry from OCR Result ───────────────────────────────
exports.autoCreatePurchaseEntry = async (ocrResult, companyId, userId, options = {}) => {
  const PurchaseOrder = require('../models/PurchaseOrder');
  const Supplier = require('../models/Supplier');
  const Product = require('../models/Product');
  const { generatePoNumber } = require('./counter.service');

  // Match or create supplier
  let supplier = null;
  if (ocrResult.supplierGST) {
    supplier = await Supplier.findOne({ company: companyId, gstNumber: ocrResult.supplierGST });
  }
  if (!supplier && ocrResult.supplierName && ocrResult.supplierName !== 'Unknown Supplier') {
    supplier = await Supplier.findOne({
      company: companyId,
      name: { $regex: ocrResult.supplierName.substring(0, 10), $options: 'i' }
    });
  }

  // Match products to existing catalog
  const resolvedItems = await Promise.all(
    (ocrResult.items || []).map(async (item) => {
      const product = await Product.findOne({
        company: companyId,
        $or: [
          { name: { $regex: item.name.substring(0, 8), $options: 'i' } },
          { hsn: item.hsn }
        ]
      }).select('_id name sku');

      return {
        product: product?._id || null,
        name: item.name,
        sku: product?.sku || '',
        orderedQty: item.quantity,
        receivedQty: 0,
        freeQty: 0,
        purchasePrice: item.purchasePrice,
        taxRate: item.taxRate || 18,
        taxAmount: item.taxAmount,
        discountPercent: 0,
        discountAmount: 0,
        total: item.total,
        hsn: item.hsn || ''
      };
    })
  );

  const poNumber = await generatePoNumber(companyId);
  const subtotal = resolvedItems.reduce((s, i) => s + (i.purchasePrice * i.orderedQty), 0);
  const taxTotal = resolvedItems.reduce((s, i) => s + i.taxAmount, 0);

  const po = await PurchaseOrder.create({
    company: companyId,
    branch: options.branchId,
    supplier: supplier?._id,
    supplierName: ocrResult.supplierName,
    supplierGST: ocrResult.supplierGST,
    poNumber,
    referenceNumber: ocrResult.invoiceNumber,
    orderDate: new Date(ocrResult.invoiceDate),
    expectedDeliveryDate: ocrResult.dueDate ? new Date(ocrResult.dueDate) : null,
    items: resolvedItems,
    subtotal: parseFloat(subtotal.toFixed(2)),
    taxTotal: parseFloat(taxTotal.toFixed(2)),
    grandTotal: ocrResult.grandTotal || parseFloat((subtotal + taxTotal).toFixed(2)),
    status: 'draft',
    paymentStatus: 'unpaid',
    notes: `Auto-created via OCR Engine from invoice ${ocrResult.invoiceNumber || ocrResult.sourceFile}`,
    ocrGenerated: true,
    createdBy: userId
  });

  return { purchaseOrder: po, supplierMatched: !!supplier, itemsMatched: resolvedItems.filter(i => i.product).length };
};
