'use strict';

const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const uploadsDir = path.join(__dirname, '../../uploads/invoices');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Generate invoice PDF buffer
 */
exports.generateInvoicePdfBuffer = async (invoice, company) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    const primaryColor = company?.primaryColor || '#6366f1';
    const pageWidth = doc.page.width - 80;
    
    // ─── Header ──────────────────────────────────────────────────────────────
    // Company Logo
    if (company?.logo) {
      try {
        const logoPath = path.join(__dirname, '../../', company.logo);
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 40, 40, { width: 80, height: 80 });
        }
      } catch {}
    }
    
    // Company Name
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#1f2937')
      .text(company?.name || 'Your Company', 140, 45);
    
    doc.fontSize(9).font('Helvetica').fillColor('#6b7280');
    if (company?.address?.line1) doc.text(company.address.line1, 140, 70);
    if (company?.address?.city) doc.text(`${company.address.city}, ${company.address.state} - ${company.address.pincode}`, 140, 83);
    if (company?.phone) doc.text(`Phone: ${company.phone}`, 140, 96);
    if (company?.gst?.gstin) doc.text(`GSTIN: ${company.gst.gstin}`, 140, 109);
    
    // Invoice title bar
    doc.rect(0, 140, doc.page.width, 40).fill(primaryColor);
    doc.fontSize(16).font('Helvetica-Bold').fillColor('white')
      .text(invoice.invoiceType === 'pos' ? 'SALES RECEIPT' : 'TAX INVOICE', 40, 151, { align: 'center', width: doc.page.width - 80 });
    
    // ─── Invoice Details ───────────────────────────────────────────────────
    doc.fillColor('#1f2937');
    const detailY = 200;
    
    doc.fontSize(9).font('Helvetica-Bold').text('Invoice No:', 40, detailY).font('Helvetica').text(invoice.invoiceNumber, 120, detailY);
    doc.font('Helvetica-Bold').text('Date:', 40, detailY + 16).font('Helvetica').text(new Date(invoice.invoiceDate).toLocaleDateString('en-IN'), 120, detailY + 16);
    if (invoice.dueDate) {
      doc.font('Helvetica-Bold').text('Due Date:', 40, detailY + 32).font('Helvetica').text(new Date(invoice.dueDate).toLocaleDateString('en-IN'), 120, detailY + 32);
    }
    
    // Bill To
    doc.font('Helvetica-Bold').fillColor(primaryColor).text('BILL TO:', 300, detailY);
    doc.font('Helvetica').fillColor('#1f2937');
    doc.text(invoice.customerName || 'Walk-in Customer', 300, detailY + 14);
    if (invoice.customerPhone) doc.text(invoice.customerPhone, 300, detailY + 28);
    if (invoice.customerGstin) doc.text(`GSTIN: ${invoice.customerGstin}`, 300, detailY + 42);
    if (invoice.billingAddress?.city) doc.text(`${invoice.billingAddress.city}, ${invoice.billingAddress.state}`, 300, detailY + 56);
    
    // ─── Items Table ───────────────────────────────────────────────────────
    const tableTop = 290;
    const tableHeaders = ['#', 'Item Description', 'HSN', 'Qty', 'Rate', 'Disc%', 'Tax%', 'Amount'];
    const colWidths = [25, 155, 50, 35, 60, 35, 35, 65];
    const colPositions = [40];
    colWidths.forEach((w, i) => colPositions.push(colPositions[i] + w));
    
    // Table header
    doc.rect(40, tableTop, pageWidth, 22).fill(primaryColor);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('white');
    tableHeaders.forEach((h, i) => {
      const align = i > 1 ? 'right' : 'left';
      doc.text(h, colPositions[i] + 2, tableTop + 7, { width: colWidths[i] - 4, align });
    });
    
    // Table rows
    let rowY = tableTop + 22;
    invoice.items.forEach((item, idx) => {
      const isEven = idx % 2 === 0;
      if (isEven) doc.rect(40, rowY, pageWidth, 20).fill('#f9fafb');
      
      doc.fontSize(8).font('Helvetica').fillColor('#1f2937');
      doc.text(String(idx + 1), colPositions[0] + 2, rowY + 6, { width: colWidths[0] - 4 });
      doc.text(item.name || '', colPositions[1] + 2, rowY + 6, { width: colWidths[1] - 4 });
      doc.text(item.hsnCode || '', colPositions[2] + 2, rowY + 6, { width: colWidths[2] - 4, align: 'right' });
      doc.text(String(item.quantity || 0), colPositions[3] + 2, rowY + 6, { width: colWidths[3] - 4, align: 'right' });
      doc.text(`₹${(item.sellingPrice || 0).toFixed(2)}`, colPositions[4] + 2, rowY + 6, { width: colWidths[4] - 4, align: 'right' });
      doc.text(`${item.discount || 0}%`, colPositions[5] + 2, rowY + 6, { width: colWidths[5] - 4, align: 'right' });
      doc.text(`${item.taxRate || 0}%`, colPositions[6] + 2, rowY + 6, { width: colWidths[6] - 4, align: 'right' });
      doc.text(`₹${(item.total || 0).toFixed(2)}`, colPositions[7] + 2, rowY + 6, { width: colWidths[7] - 4, align: 'right' });
      
      rowY += 20;
    });
    
    // Table border
    doc.rect(40, tableTop, pageWidth, rowY - tableTop).stroke('#e5e7eb');
    
    // ─── Totals ────────────────────────────────────────────────────────────
    const totalsX = 380;
    let totalsY = rowY + 15;
    
    const totalsData = [
      ['Subtotal:', `₹${(invoice.subtotal || 0).toFixed(2)}`],
      ['Discount:', `-₹${(invoice.discountAmount || 0).toFixed(2)}`],
      ['Taxable Amount:', `₹${(invoice.taxableAmount || 0).toFixed(2)}`],
    ];
    
    if (invoice.cgstAmount > 0) totalsData.push(['CGST:', `₹${(invoice.cgstAmount || 0).toFixed(2)}`]);
    if (invoice.sgstAmount > 0) totalsData.push(['SGST:', `₹${(invoice.sgstAmount || 0).toFixed(2)}`]);
    if (invoice.igstAmount > 0) totalsData.push(['IGST:', `₹${(invoice.igstAmount || 0).toFixed(2)}`]);
    if (invoice.shippingCharges > 0) totalsData.push(['Shipping:', `₹${invoice.shippingCharges.toFixed(2)}`]);
    if (invoice.roundOff !== 0) totalsData.push(['Round Off:', `₹${(invoice.roundOff || 0).toFixed(2)}`]);
    
    totalsData.forEach(([label, value]) => {
      doc.fontSize(9).font('Helvetica').fillColor('#6b7280').text(label, totalsX, totalsY, { width: 100 });
      doc.font('Helvetica').fillColor('#1f2937').text(value, totalsX + 100, totalsY, { width: 75, align: 'right' });
      totalsY += 15;
    });
    
    // Grand Total
    doc.rect(totalsX - 5, totalsY - 2, 185, 24).fill(primaryColor);
    doc.fontSize(11).font('Helvetica-Bold').fillColor('white')
      .text('GRAND TOTAL:', totalsX, totalsY + 5, { width: 100 })
      .text(`₹${(invoice.grandTotal || 0).toFixed(2)}`, totalsX + 100, totalsY + 5, { width: 75, align: 'right' });
    
    // Payment status
    totalsY += 40;
    const statusColor = invoice.paymentStatus === 'paid' ? '#16a34a' : invoice.paymentStatus === 'partial' ? '#d97706' : '#dc2626';
    doc.fontSize(10).font('Helvetica-Bold').fillColor(statusColor)
      .text(`Payment Status: ${(invoice.paymentStatus || 'unpaid').toUpperCase()}`, totalsX, totalsY);
    
    if (invoice.paidAmount > 0) {
      doc.font('Helvetica').fillColor('#6b7280')
        .text(`Paid: ₹${invoice.paidAmount.toFixed(2)}  |  Due: ₹${(invoice.dueAmount || 0).toFixed(2)}`, totalsX, totalsY + 15);
    }
    
    // ─── Footer ────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 80;
    doc.rect(0, footerY, doc.page.width, 1).fill('#e5e7eb');
    
    if (invoice.notes) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#6b7280').text('Notes:', 40, footerY + 10);
      doc.font('Helvetica').text(invoice.notes, 40, footerY + 22, { width: 300 });
    }
    
    doc.fontSize(8).font('Helvetica').fillColor('#9ca3af')
      .text('Thank you for your business!', 0, footerY + 10, { align: 'center', width: doc.page.width })
      .text('Generated by Inventra Enterprise ERP', 0, footerY + 22, { align: 'center', width: doc.page.width });
    
    doc.end();
  });
};

/**
 * Generate and save invoice PDF
 */
exports.generateInvoicePdf = async (invoice, companyId) => {
  try {
    const Company = require('../models/Company');
    const company = await Company.findById(companyId);
    const buffer = await exports.generateInvoicePdfBuffer(invoice, company);
    
    const filename = `invoice-${invoice.invoiceNumber}-${Date.now()}.pdf`;
    const filepath = path.join(uploadsDir, filename);
    fs.writeFileSync(filepath, buffer);
    
    return `/uploads/invoices/${filename}`;
  } catch (err) {
    logger.error('PDF generation error:', err);
    return null;
  }
};
