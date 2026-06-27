'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

// Shared stub for routes not yet fully implemented but required by server.js
const createStubRouter = (name) => {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', (req, res) => res.json({ success: true, message: `${name} module active`, data: [] }));
  router.post('/', asyncHandler(async (req, res) => res.status(201).json({ success: true, message: `${name} created`, data: req.body })));
  router.route('/:id')
    .get((req, res) => res.json({ success: true, message: `${name} item`, data: {} }))
    .put((req, res) => res.json({ success: true, message: `${name} updated`, data: req.body }))
    .delete((req, res) => res.json({ success: true, message: `${name} deleted` }));
  return router;
};

module.exports = {
  settingRouter: createStubRouter('Settings'),
  reportRouter: createStubRouter('Reports'),
  documentRouter: createStubRouter('Documents'),
  serviceRouter: createStubRouter('Service'),
  expenseRouter: createStubRouter('Expenses')
};
