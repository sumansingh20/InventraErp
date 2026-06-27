'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
  try {
    const trans = getTransporter();
    const info = await trans.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'Inventra ERP'}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
      text,
      attachments
    });
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return info;
  } catch (err) {
    logger.error('Email send error:', err);
    throw err;
  }
};

exports.sendWelcomeEmail = async (user, verifyUrl) => {
  await sendEmail({
    to: user.email,
    subject: 'Welcome to Inventra ERP - Verify Your Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Inventra Enterprise ERP</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Your complete business management solution</p>
        </div>
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1f2937;">Welcome aboard, ${user.name}! 🎉</h2>
          <p style="color: #6b7280; line-height: 1.6;">Your Inventra ERP account has been created successfully. To get started, please verify your email address.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">Verify Email Address</a>
          </div>
          <p style="color: #9ca3af; font-size: 14px;">This link expires in 24 hours. If you didn't create this account, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 13px; text-align: center;">© ${new Date().getFullYear()} Inventra Enterprise ERP. All rights reserved.</p>
        </div>
      </div>
    `
  });
};

exports.sendPasswordResetEmail = async (user, resetUrl) => {
  await sendEmail({
    to: user.email,
    subject: 'Inventra ERP - Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #dc2626; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">Password Reset</h1>
        </div>
        <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
          <p>Hello ${user.name},</p>
          <p>You requested a password reset. Click the button below to reset your password. This link is valid for 1 hour.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background: #dc2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">Reset Password</a>
          </div>
          <p style="color: #9ca3af; font-size: 14px;">If you didn't request this, please ignore this email and your password will remain unchanged.</p>
        </div>
      </div>
    `
  });
};

exports.sendPasswordChangedEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: 'Inventra ERP - Password Changed',
    html: `<p>Hello ${user.name}, your Inventra ERP password was changed successfully. If you didn't do this, contact support immediately.</p>`
  });
};

exports.sendInvoiceEmail = async (invoice, customer) => {
  await sendEmail({
    to: customer.email,
    subject: `Invoice #${invoice.invoiceNumber} from Inventra ERP`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2>Invoice #${invoice.invoiceNumber}</h2>
        <p>Dear ${customer.name},</p>
        <p>Please find your invoice details below:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr style="background: #f3f4f6;">
            <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Description</th>
            <th style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">Amount</th>
          </tr>
          ${invoice.items.map(item => `
            <tr>
              <td style="padding: 10px; border: 1px solid #e5e7eb;">${item.name} x ${item.quantity}</td>
              <td style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">₹${item.total.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr style="background: #f3f4f6; font-weight: bold;">
            <td style="padding: 10px; border: 1px solid #e5e7eb;">Total</td>
            <td style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">₹${invoice.grandTotal.toFixed(2)}</td>
          </tr>
        </table>
        <p>Thank you for your business!</p>
      </div>
    `
  });
};

exports.sendOTPEmail = async (user, otp) => {
  await sendEmail({
    to: user.email,
    subject: 'Inventra ERP - Your OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; text-align: center; padding: 30px;">
        <h2>Your OTP Code</h2>
        <div style="font-size: 48px; font-weight: bold; color: #6366f1; letter-spacing: 8px; margin: 20px 0;">${otp}</div>
        <p style="color: #6b7280;">This OTP expires in 10 minutes. Do not share it with anyone.</p>
      </div>
    `
  });
};
