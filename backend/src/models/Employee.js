'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;

const employeeSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  // Identity
  employeeId: { type: String, required: true },
  name: { type: String, required: true },
  salutation: String,
  
  // Personal
  email: String,
  phone: String,
  alternatePhone: String,
  dateOfBirth: Date,
  gender: { type: String, enum: ['male', 'female', 'other'] },
  bloodGroup: String,
  maritalStatus: { type: String, enum: ['single', 'married', 'divorced', 'widowed'] },
  nationality: { type: String, default: 'Indian' },
  
  // Address
  currentAddress: {
    line1: String, line2: String, city: String,
    state: String, pincode: String, country: { type: String, default: 'India' }
  },
  permanentAddress: {
    line1: String, line2: String, city: String,
    state: String, pincode: String, country: { type: String, default: 'India' }
  },
  
  // Emergency Contact
  emergencyContact: {
    name: String, relation: String, phone: String
  },
  
  // Documents
  aadharNumber: String,
  panNumber: String,
  passport: String,
  drivingLicense: String,
  
  // Employment
  designation: String,
  department: String,
  jobTitle: String,
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time', 'contract', 'intern', 'consultant', 'probation'],
    default: 'full_time'
  },
  joiningDate: Date,
  confirmationDate: Date,
  probationPeriod: { type: Number, default: 0 }, // months
  
  // Reporting
  reportingTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  
  // Salary
  salary: {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    da: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    pfDeduction: { type: Number, default: 0 },
    esiDeduction: { type: Number, default: 0 },
    tdsDeduction: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    salaryType: { type: String, enum: ['monthly', 'weekly', 'daily', 'hourly'], default: 'monthly' },
    paymentMode: { type: String, enum: ['bank', 'cash', 'cheque'], default: 'bank' }
  },
  
  // Bank
  bankAccount: {
    bankName: String,
    accountName: String,
    accountNumber: String,
    ifscCode: String,
    branchName: String
  },
  
  // PF/ESI
  pfApplicable: { type: Boolean, default: false },
  pfNumber: String,
  esiApplicable: { type: Boolean, default: false },
  esiNumber: String,
  
  // Leave Balance
  leaveBalance: {
    casual: { type: Number, default: 0 },
    sick: { type: Number, default: 0 },
    earned: { type: Number, default: 0 },
    compensatory: { type: Number, default: 0 },
    maternity: { type: Number, default: 0 },
    paternity: { type: Number, default: 0 }
  },
  
  // Shift
  shift: { type: Schema.Types.ObjectId, ref: 'Shift' },
  
  // User account
  userAccount: { type: Schema.Types.ObjectId, ref: 'User' },
  
  // Documents
  documents: [{
    type: String,
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Assets
  assignedAssets: [{ type: Schema.Types.ObjectId }],
  
  // Photo
  photo: String,
  
  // Biometric
  biometricId: String,
  faceData: { type: String, select: false },
  
  // Status
  isActive: { type: Boolean, default: true },
  isOnLeave: { type: Boolean, default: false },
  exitDate: Date,
  exitReason: String,
  exitType: { type: String, enum: ['resignation', 'termination', 'retirement', 'contract_end', 'absconding'] },
  
  // Audit
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

employeeSchema.index({ company: 1, employeeId: 1 }, { unique: true });
employeeSchema.index({ company: 1, name: 'text', employeeId: 'text' });
employeeSchema.index({ company: 1, department: 1 });
employeeSchema.index({ company: 1, isActive: 1 });
employeeSchema.index({ userAccount: 1 }, { sparse: true });

const Employee = mongoose.model('Employee', employeeSchema);

// Attendance
const attendanceSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  date: { type: Date, required: true },
  
  checkIn: Date,
  checkOut: Date,
  checkInLocation: { lat: Number, lng: Number },
  checkOutLocation: { lat: Number, lng: Number },
  
  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'leave', 'holiday', 'weekly_off', 'late'],
    default: 'present'
  },
  
  workingHours: { type: Number, default: 0 },
  overtime: { type: Number, default: 0 },
  lateMinutes: { type: Number, default: 0 },
  
  shift: { type: Schema.Types.ObjectId, ref: 'Shift' },
  
  checkInMethod: { type: String, enum: ['manual', 'biometric', 'face', 'gps', 'qr', 'rfid'] },
  
  isLate: { type: Boolean, default: false },
  isEarlyLeave: { type: Boolean, default: false },
  
  notes: String,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

attendanceSchema.index({ company: 1, employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ company: 1, date: -1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);

// Leave
const leaveSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  
  leaveType: { type: String, enum: ['casual', 'sick', 'earned', 'compensatory', 'maternity', 'paternity', 'unpaid', 'other'] },
  
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  totalDays: { type: Number, default: 1 },
  isHalfDay: { type: Boolean, default: false },
  halfDayType: { type: String, enum: ['morning', 'evening'] },
  
  reason: String,
  
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  rejectedReason: String,
  
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

leaveSchema.index({ company: 1, employee: 1 });
leaveSchema.index({ company: 1, fromDate: -1 });

const Leave = mongoose.model('Leave', leaveSchema);

// Payroll
const payrollSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  
  month: { type: Number, required: true }, // 1-12
  year: { type: Number, required: true },
  
  workingDays: { type: Number, default: 26 },
  presentDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  leaveDays: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  
  // Earnings
  basic: { type: Number, default: 0 },
  hra: { type: Number, default: 0 },
  da: { type: Number, default: 0 },
  conveyance: { type: Number, default: 0 },
  medicalAllowance: { type: Number, default: 0 },
  otherAllowances: { type: Number, default: 0 },
  overtimePay: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  
  // Deductions
  pfDeduction: { type: Number, default: 0 },
  esiDeduction: { type: Number, default: 0 },
  tdsDeduction: { type: Number, default: 0 },
  advanceDeduction: { type: Number, default: 0 },
  loanDeduction: { type: Number, default: 0 },
  absenceDeduction: { type: Number, default: 0 },
  otherDeductions: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  
  grossSalary: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  
  // Payment
  paymentStatus: { type: String, enum: ['pending', 'paid', 'on_hold'], default: 'pending' },
  paymentDate: Date,
  paymentMode: String,
  transactionId: String,
  
  pdfUrl: String,
  
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

payrollSchema.index({ company: 1, employee: 1, month: 1, year: 1 }, { unique: true });
payrollSchema.index({ company: 1, month: 1, year: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);

// Shift
const shiftSchema = new Schema({
  company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  name: { type: String, required: true },
  startTime: String, // "09:00"
  endTime: String,   // "18:00"
  workingHours: Number,
  breakTime: Number, // minutes
  workingDays: [String], // ['monday', 'tuesday', ...]
  isNightShift: { type: Boolean, default: false },
  gracePeriod: { type: Number, default: 15 }, // minutes
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Shift = mongoose.model('Shift', shiftSchema);

module.exports = { Employee, Attendance, Leave, Payroll, Shift };
