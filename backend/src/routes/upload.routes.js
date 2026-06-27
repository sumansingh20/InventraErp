'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsDir, req.body.folder || 'general');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error(`File type ${file.mimetype} not allowed`), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 } });

const router = express.Router();
router.use(authenticate);

router.post('/single', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new Error('No file uploaded');
  
  let fileUrl = `/uploads/${req.body.folder || 'general'}/${req.file.filename}`;
  
  // Compress images
  if (req.file.mimetype.startsWith('image/')) {
    const outputPath = req.file.path.replace(path.extname(req.file.path), '_opt.webp');
    await sharp(req.file.path).resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toFile(outputPath);
    fileUrl = `/uploads/${req.body.folder || 'general'}/${path.basename(outputPath)}`;
  }
  
  res.json({ success: true, data: { url: fileUrl, filename: req.file.filename, originalName: req.file.originalname, size: req.file.size } });
}));

router.post('/multiple', upload.array('files', 10), asyncHandler(async (req, res) => {
  const files = req.files.map(f => ({
    url: `/uploads/${req.body.folder || 'general'}/${f.filename}`,
    filename: f.filename,
    originalName: f.originalname,
    size: f.size
  }));
  res.json({ success: true, data: { files } });
}));

router.delete('/', asyncHandler(async (req, res) => {
  const { filename, folder } = req.body;
  const filePath = path.join(uploadsDir, folder || 'general', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: 'File deleted.' });
  } else {
    res.status(404).json({ success: false, message: 'File not found.' });
  }
}));

module.exports = router;
