'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const purchaseController = require('../controllers/purchaseController');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// Setup Multer for OCR Image Uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fs = require('fs');
    const uploadDir = path.join(__dirname, '../../uploads/temp');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB Limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  }
});

router.use(authenticate);

// ─── Smart Document OCR Scan ───────────────────────────────────────────────────
router.post('/ocr-scan', upload.single('invoiceImage'), purchaseController.ocrScan);

// ─── Purchase Orders ──────────────────────────────────────────────────────────
router.route('/')
  .get(purchaseController.getPurchases)
  .post(purchaseController.createPurchase);

router.route('/:id')
  .get(purchaseController.getPurchaseById)
  .put(purchaseController.updatePurchase)
  .delete(purchaseController.deletePurchase);

// Approve PO
router.post('/:id/approve', purchaseController.approvePurchase);

// GRN - Goods Receipt Note
router.post('/:id/grn', purchaseController.createGRN);

// Payment on Purchase
router.post('/:id/payment', purchaseController.recordPayment);

module.exports = router;
