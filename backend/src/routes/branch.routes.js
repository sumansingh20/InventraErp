'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { companyRouter } = require('./company.routes');

module.exports = companyRouter;
