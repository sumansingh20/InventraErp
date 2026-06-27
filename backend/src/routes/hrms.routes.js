'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { Employee, Attendance, Leave, Payroll, Shift } = require('../models/Employee');
const counterService = require('../services/counter.service');

const router = express.Router();
router.use(authenticate);

// ─── Employees ─────────────────────────────────────────────────────────────────
router.get('/employees', asyncHandler(async (req, res) => {
  const { search, department, page = 1, limit = 25, isActive = 'true' } = req.query;
  const filter = { company: req.companyId, isActive: isActive !== 'false' };
  if (department) filter.department = department;
  if (search) filter.$or = [
    { name: { $regex: search, $options: 'i' } },
    { employeeId: { $regex: search, $options: 'i' } },
    { designation: { $regex: search, $options: 'i' } }
  ];
  const skip = (page - 1) * limit;
  const [employees, total] = await Promise.all([
    Employee.find(filter).select('-salary.pfDeduction -salary.esiDeduction').sort('name').skip(skip).limit(parseInt(limit)),
    Employee.countDocuments(filter)
  ]);
  res.json({ success: true, data: { employees, total, page: parseInt(page), pages: Math.ceil(total / limit) } });
}));

router.post('/employees', asyncHandler(async (req, res) => {
  const count = await Employee.countDocuments({ company: req.companyId });
  req.body.employeeId = req.body.employeeId || `EMP-${String(count + 1).padStart(5, '0')}`;
  req.body.company = req.companyId;
  req.body.branch = req.branchId;
  req.body.createdBy = req.user._id;
  const employee = await Employee.create(req.body);
  res.status(201).json({ success: true, data: { employee } });
}));

router.route('/employees/:id')
  .get(asyncHandler(async (req, res) => {
    const emp = await Employee.findOne({ _id: req.params.id, company: req.companyId })
      .populate('reportingTo', 'name').populate('shift');
    if (!emp) throw new AppError('Employee not found', 404);
    res.json({ success: true, data: { employee: emp } });
  }))
  .put(asyncHandler(async (req, res) => {
    const emp = await Employee.findOneAndUpdate(
      { _id: req.params.id, company: req.companyId },
      { ...req.body, updatedBy: req.user._id }, { new: true }
    );
    res.json({ success: true, data: { employee: emp } });
  }));

// ─── Attendance ─────────────────────────────────────────────────────────────────
router.get('/attendance', asyncHandler(async (req, res) => {
  const { date, employeeId, month, year, page = 1, limit = 50 } = req.query;
  const filter = { company: req.companyId };
  if (employeeId) filter.employee = employeeId;
  if (date) {
    const d = new Date(date);
    filter.date = { $gte: d, $lte: new Date(d.setHours(23, 59, 59)) };
  } else if (month && year) {
    filter.date = {
      $gte: new Date(year, month - 1, 1),
      $lte: new Date(year, month, 0, 23, 59, 59)
    };
  }
  const skip = (page - 1) * limit;
  const records = await Attendance.find(filter)
    .populate('employee', 'name employeeId').sort('-date').skip(skip).limit(parseInt(limit));
  res.json({ success: true, data: { records } });
}));

router.post('/attendance', asyncHandler(async (req, res) => {
  const { employeeId, date, checkIn, checkOut, status } = req.body;
  const attendance = await Attendance.findOneAndUpdate(
    { company: req.companyId, employee: employeeId, date: new Date(date) },
    { checkIn, checkOut, status, branch: req.branchId },
    { upsert: true, new: true }
  );
  res.json({ success: true, data: { attendance } });
}));

router.post('/attendance/bulk', asyncHandler(async (req, res) => {
  const { records } = req.body;
  const ops = records.map(r => ({
    updateOne: {
      filter: { company: req.companyId, employee: r.employee, date: new Date(r.date) },
      update: { $set: { ...r, company: req.companyId } },
      upsert: true
    }
  }));
  await Attendance.bulkWrite(ops);
  res.json({ success: true, message: 'Attendance updated.' });
}));

// ─── Leave Management ──────────────────────────────────────────────────────────
router.get('/leaves', asyncHandler(async (req, res) => {
  const { status, employeeId, page = 1, limit = 25 } = req.query;
  const filter = { company: req.companyId };
  if (status) filter.status = status;
  if (employeeId) filter.employee = employeeId;
  const leaves = await Leave.find(filter)
    .populate('employee', 'name employeeId').sort('-createdAt').skip((page - 1) * limit).limit(parseInt(limit));
  res.json({ success: true, data: { leaves } });
}));

router.post('/leaves', asyncHandler(async (req, res) => {
  const leave = await Leave.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { leave } });
}));

router.put('/leaves/:id/approve', asyncHandler(async (req, res) => {
  const leave = await Leave.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { status: 'approved', approvedBy: req.user._id, approvedAt: new Date() },
    { new: true }
  );
  // Update employee leave balance
  if (leave) {
    await Employee.findByIdAndUpdate(leave.employee, {
      $inc: { [`leaveBalance.${leave.leaveType}`]: -leave.totalDays }
    });
  }
  res.json({ success: true, data: { leave } });
}));

router.put('/leaves/:id/reject', asyncHandler(async (req, res) => {
  const leave = await Leave.findOneAndUpdate(
    { _id: req.params.id, company: req.companyId },
    { status: 'rejected', rejectedReason: req.body.reason },
    { new: true }
  );
  res.json({ success: true, data: { leave } });
}));

// ─── Payroll ───────────────────────────────────────────────────────────────────
router.get('/payroll', asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const filter = { company: req.companyId };
  if (month) filter.month = parseInt(month);
  if (year) filter.year = parseInt(year);
  const payrolls = await Payroll.find(filter).populate('employee', 'name employeeId designation');
  res.json({ success: true, data: { payrolls } });
}));

router.post('/payroll/process', asyncHandler(async (req, res) => {
  const { month, year, employeeIds } = req.body;
  const mongooseModule = require('mongoose');
  
  const employees = employeeIds
    ? await Employee.find({ _id: { $in: employeeIds }, company: req.companyId, isActive: true })
    : await Employee.find({ company: req.companyId, isActive: true });
  
  const attendanceRecords = await Attendance.find({
    company: req.companyId,
    date: { $gte: new Date(year, month - 1, 1), $lte: new Date(year, month, 0) }
  });
  
  const attMap = {};
  attendanceRecords.forEach(a => {
    const empId = a.employee.toString();
    if (!attMap[empId]) attMap[empId] = { present: 0, absent: 0, leave: 0 };
    if (a.status === 'present') attMap[empId].present++;
    else if (a.status === 'absent') attMap[empId].absent++;
    else if (a.status === 'leave') attMap[empId].leave++;
  });
  
  const workingDays = 26; // default
  const payrolls = [];
  
  for (const emp of employees) {
    const att = attMap[emp._id.toString()] || { present: workingDays, absent: 0, leave: 0 };
    const presentDays = att.present;
    const dailyRate = emp.salary.netSalary / workingDays;
    const absentDeduction = (workingDays - presentDays) * dailyRate;
    
    const netSalary = Math.max(0, emp.salary.grossSalary - emp.salary.pfDeduction - emp.salary.esiDeduction - emp.salary.tdsDeduction - absentDeduction);
    
    const existingPayroll = await Payroll.findOne({ company: req.companyId, employee: emp._id, month, year });
    
    if (existingPayroll) {
      payrolls.push(await Payroll.findByIdAndUpdate(existingPayroll._id, {
        workingDays, presentDays, absentDays: att.absent, leaveDays: att.leave,
        basic: emp.salary.basic, hra: emp.salary.hra, da: emp.salary.da,
        conveyance: emp.salary.conveyance, medicalAllowance: emp.salary.medicalAllowance,
        otherAllowances: emp.salary.otherAllowances,
        totalEarnings: emp.salary.grossSalary,
        pfDeduction: emp.salary.pfDeduction, esiDeduction: emp.salary.esiDeduction,
        tdsDeduction: emp.salary.tdsDeduction, absenceDeduction: absentDeduction,
        totalDeductions: emp.salary.pfDeduction + emp.salary.esiDeduction + emp.salary.tdsDeduction + absentDeduction,
        grossSalary: emp.salary.grossSalary, netSalary,
        processedBy: req.user._id
      }, { new: true }));
    } else {
      payrolls.push(await Payroll.create({
        company: req.companyId, employee: emp._id, branch: req.branchId,
        month, year, workingDays, presentDays, absentDays: att.absent, leaveDays: att.leave,
        basic: emp.salary.basic, hra: emp.salary.hra, da: emp.salary.da,
        conveyance: emp.salary.conveyance, medicalAllowance: emp.salary.medicalAllowance,
        otherAllowances: emp.salary.otherAllowances,
        totalEarnings: emp.salary.grossSalary,
        pfDeduction: emp.salary.pfDeduction, esiDeduction: emp.salary.esiDeduction,
        tdsDeduction: emp.salary.tdsDeduction, absenceDeduction: absentDeduction,
        totalDeductions: emp.salary.pfDeduction + emp.salary.esiDeduction + emp.salary.tdsDeduction + absentDeduction,
        grossSalary: emp.salary.grossSalary, netSalary, paymentStatus: 'pending',
        processedBy: req.user._id, createdBy: req.user._id
      }));
    }
  }
  
  res.json({ success: true, message: `Payroll processed for ${payrolls.length} employees.`, data: { payrolls } });
}));

// ─── Shifts ─────────────────────────────────────────────────────────────────────
router.get('/shifts', asyncHandler(async (req, res) => {
  const shifts = await Shift.find({ company: req.companyId });
  res.json({ success: true, data: { shifts } });
}));

router.post('/shifts', asyncHandler(async (req, res) => {
  const shift = await Shift.create({ ...req.body, company: req.companyId, createdBy: req.user._id });
  res.status(201).json({ success: true, data: { shift } });
}));

module.exports = router;
