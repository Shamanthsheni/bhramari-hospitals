const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Middleware to ensure staff is logged in
function ensureStaff(req, res, next) {
  if (!req.session.user || req.session.role !== 'staff') {
    req.flash('error', 'Please login first');
    return res.redirect('/auth/login?type=staff');
  }
  next();
}

router.use(ensureStaff);

// POST: Admit Patient
router.post('/admit', async (req, res) => {
  const { appointment_id, room_number, patient_id, assign_nurse } = req.body;

  if (!appointment_id || !room_number || !patient_id) {
    req.flash('error', 'Missing required data');
    return res.redirect('/staff/dashboard');
  }

  try {
    // Get room details
    const [roomResult] = await db.promise().query(
      'SELECT id, status FROM rooms WHERE room_number = ?',
      [room_number]
    );

    if (roomResult.length === 0) throw new Error('Room not found');
    if (roomResult[0].status.toLowerCase() === 'occupied') {
      throw new Error(`Room ${room_number} is currently occupied`);
    }

    const room_id = roomResult[0].id;

    let nurse_id = null;

    if (assign_nurse === 'yes') {
      const [nurseResult] = await db.promise().query(`
        SELECT id FROM staff 
        WHERE position = 'nurse' 
        AND id NOT IN (
          SELECT nurse_id FROM admissions WHERE status = 'Admitted'
        )
        LIMIT 1
      `);
      if (nurseResult.length === 0) throw new Error('No available nurse');
      nurse_id = nurseResult[0].id;
    }

    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      // Update room
      await conn.query(
        `UPDATE rooms SET status = 'Occupied', patient_id = ?, nurse_id = ? WHERE id = ?`,
        [patient_id, nurse_id, room_id]
      );

      // Update appointment
      await conn.query(
        `UPDATE appointments SET room_id = ?, status = 'Admitted' WHERE id = ?`,
        [room_id, appointment_id]
      );

      // Insert admission
      await conn.query(
        `INSERT INTO admissions (patient_id, appointment_id, room_id, nurse_id, status)
         VALUES (?, ?, ?, ?, 'Admitted')`,
        [patient_id, appointment_id, room_id, nurse_id]
      );

      await conn.commit();
      req.flash('success', `Patient admitted to Room ${room_number}`);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.redirect('/staff/dashboard');
  } catch (err) {
    console.error('Admit error:', err);
    req.flash('error', err.message || 'Failed to admit patient');
    res.redirect('/staff/dashboard');
  }
});

// POST: Discharge Patient
router.post('/discharge', async (req, res) => {
  const { patient_id, appointment_id } = req.body;

  if (!patient_id || !appointment_id) {
    req.flash('error', 'Missing patient or appointment ID');
    return res.redirect('/staff/dashboard');
  }

  try {
    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      const [admissionResult] = await conn.query(
        `SELECT room_id FROM admissions
         WHERE patient_id = ? AND appointment_id = ? AND status = 'Admitted' LIMIT 1`,
        [patient_id, appointment_id]
      );

      if (admissionResult.length === 0) throw new Error('No active admission found');

      const room_id = admissionResult[0].room_id;

      // Update admissions
      await conn.query(
        `UPDATE admissions SET status = 'Discharged', discharged_at = NOW()
         WHERE patient_id = ? AND appointment_id = ?`,
        [patient_id, appointment_id]
      );

      // Update appointments
      await conn.query(
        `UPDATE appointments SET status = 'Completed' WHERE id = ?`,
        [appointment_id]
      );

      // Free room
      await conn.query(
        `UPDATE rooms SET status = 'Available', patient_id = NULL, nurse_id = NULL WHERE id = ?`,
        [room_id]
      );

      await conn.commit();
      req.flash('success', 'Patient successfully discharged');
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.redirect('/staff/dashboard');
  } catch (err) {
    console.error('Discharge error:', err);
    req.flash('error', err.message || 'Failed to discharge patient');
    res.redirect('/staff/dashboard');
  }
});

module.exports = router;
