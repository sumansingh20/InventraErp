'use strict';
const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { paymentRouter } = require('./pos.routes');
module.exports = paymentRouter;
