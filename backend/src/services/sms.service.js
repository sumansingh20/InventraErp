'use strict';

const logger = require('../config/logger');
const axios = require('axios');

// Send SMS via MSG91 or similar provider
exports.sendSMS = async (phone, message) => {
  const provider = process.env.SMS_PROVIDER || 'msg91';
  
  try {
    if (provider === 'msg91') {
      await axios.get('https://api.msg91.com/api/sendhttp.php', {
        params: {
          authkey: process.env.MSG91_AUTH_KEY,
          mobiles: phone.replace(/\D/g, ''),
          message,
          sender: process.env.MSG91_SENDER_ID || 'INVTRA',
          route: 4,
          country: 91
        }
      });
      logger.info(`SMS sent to ${phone}`);
    } else if (provider === 'twilio') {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilio.messages.create({ body: message, from: process.env.TWILIO_PHONE, to: phone });
    }
  } catch (err) {
    logger.error('SMS send error:', err.message);
    // Don't throw - SMS is non-critical
  }
};

exports.sendOTPSMS = async (phone, otp) => {
  await exports.sendSMS(phone, `Your Inventra ERP OTP is: ${otp}. Valid for 10 minutes. Do not share.`);
};

exports.sendPaymentAlertSMS = async (phone, amount, invoiceNumber) => {
  await exports.sendSMS(phone, `Payment of ₹${amount} received for Invoice #${invoiceNumber}. Thank you! - Inventra ERP`);
};
