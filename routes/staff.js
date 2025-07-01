const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Middleware: Ensure Doctor or Nurse is logged in
function ensureStaff(req, res, next) {
  if (req.session.user && (req.session.role === 'doctor' || req.session.role === 'nurse')) {
    return next();
  }
  return res.redirect('/auth/login?type=staff');
}

// GET: Staff Dashboard
router.get('/dashboard', ensureStaff, async (req, res) => {
  try {
    const user = req.session.user;
    const role = req.session.role;

    if (role === 'doctor') {
      const doctorId = user.id;
      const { date, status } = req.query;

      let appointmentsQuery = `
        SELECT a.id, a.appointment_date AS date, a.start_time AS time, a.status,
               a.notes AS reason, p.id AS patient_id,
               CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
               COALESCE(a.is_admitted, FALSE) AS is_admitted
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        WHERE a.doctor_id = ?
      `;

      const filters = [];
      const params = [doctorId];

      if (date) {
        filters.push('a.appointment_date = ?');
        params.push(date);
      }
      if (status) {
        filters.push('a.status = ?');
        params.push(status);
      }
      if (filters.length) {
        appointmentsQuery += ' AND ' + filters.join(' AND ');
      }
      appointmentsQuery += ' ORDER BY a.appointment_date DESC, a.start_time ASC';

      const roomsQuery = `
        SELECT r.id, r.room_number, r.status,
          (SELECT CONCAT(s.first_name, ' ', s.last_name)
           FROM staff s
           JOIN admissions adm ON adm.nurse_id = s.id
           WHERE adm.room_id = r.id AND adm.status = 'Admitted' LIMIT 1
          ) AS nurse_name,
          (SELECT CONCAT(p.first_name, ' ', p.last_name)
           FROM appointments a
           JOIN patients p ON a.patient_id = p.id
           WHERE a.room_id = r.id AND a.status = 'Admitted'
           LIMIT 1
          ) AS patient_name,
          (SELECT adm.id FROM admissions adm WHERE adm.room_id = r.id AND adm.status = 'Admitted' LIMIT 1) AS admission_id
        FROM rooms r
      `;

      const admittedPatientsQuery = `
        SELECT adm.id AS admission_id, p.id, CONCAT(p.first_name, ' ', p.last_name) AS name, r.room_number,
               CONCAT(s.first_name, ' ', s.last_name) AS nurse_name
        FROM admissions adm
        JOIN patients p ON adm.patient_id = p.id
        JOIN rooms r ON adm.room_id = r.id
        LEFT JOIN staff s ON adm.nurse_id = s.id
        WHERE adm.status = 'Admitted'
      `;

      const patientsQuery = `SELECT id, CONCAT(first_name, ' ', last_name) AS name FROM patients`;

      const [appointments, rooms, admittedPatients, patients] = await Promise.all([
        db.promise().query(appointmentsQuery, params).then(([rows]) => rows),
        db.promise().query(roomsQuery).then(([rows]) => rows),
        db.promise().query(admittedPatientsQuery).then(([rows]) => rows),
        db.promise().query(patientsQuery).then(([rows]) => rows),
      ]);

      return res.render('doctor-dashboard', {
        doctor: { id: doctorId, name: user.name },
        appointments,
        rooms,
        admittedPatients,
        patients,
        success: req.flash('success'),
        error: req.flash('error'),
        filterDate: date || '',
        filterStatus: status || ''
      });

    } else if (role === 'nurse') {
      const nurseId = user.id;

      const assignedRoomsQuery = `
        SELECT r.id, r.room_number, r.status,
               CONCAT(s.first_name, ' ', s.last_name) AS nurse_name,
               CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
               (SELECT CONCAT(p.first_name, ' ', p.last_name)
                FROM admissions adm
                JOIN appointments a ON adm.appointment_id = a.id
                JOIN patients p ON a.patient_id = p.id
                WHERE adm.room_id = r.id AND adm.nurse_id = ? AND adm.status = 'Admitted'
                LIMIT 1
               ) AS patient_name
        FROM rooms r
        LEFT JOIN admissions adm ON adm.room_id = r.id AND adm.nurse_id = ? AND adm.status = 'Admitted'
        LEFT JOIN staff s ON s.id = adm.nurse_id
        LEFT JOIN staff d ON d.id = adm.doctor_id
        WHERE adm.nurse_id = ? AND adm.status = 'Admitted'
      `;

      const allRoomsQuery = `SELECT id, room_number, status FROM rooms`;

      const [assignedRooms, allRooms] = await Promise.all([
        db.promise().query(assignedRoomsQuery, [nurseId, nurseId, nurseId]).then(([rows]) => rows),
        db.promise().query(allRoomsQuery).then(([rows]) => rows),
      ]);

      return res.render('nurse-dashboard', {
        user,
        assignedRooms,
        allRooms,
        success: req.flash('success'),
        error: req.flash('error')
      });
    }

    req.flash('error', 'Unauthorized access');
    return res.redirect('/auth/login?type=staff');

  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error', 'Failed to load dashboard');
    return res.redirect('/auth/login?type=staff');
  }
});

// GET: Filter Appointments
router.get('/appointments/filter', (req, res) => {
  const { date, status } = req.query;
  const queryParams = new URLSearchParams();
  if (date) queryParams.append('date', date);
  if (status) queryParams.append('status', status);
  res.redirect(`/staff/dashboard?${queryParams.toString()}`);
});

// POST: Admit Patient
router.post('/admit', async (req, res) => {
  const { appointment_id, room_number, assign_nurse } = req.body;

  if (!appointment_id || !room_number) {
    req.flash('error', 'Missing required data');
    return res.redirect('/staff/dashboard');
  }

  try {
    const [[room]] = await db.promise().query(
      'SELECT id, status FROM rooms WHERE room_number = ?',
      [room_number]
    );

    if (!room) throw new Error('Room not found');
    if (room.status.toLowerCase() === 'occupied') {
      throw new Error(`Room ${room_number} is already occupied`);
    }

    const room_id = room.id;

    // Assign nurse if requested
    let nurse_id = null;
    let nurseAssigned = false;
    if (assign_nurse === 'yes') {
      const [nurses] = await db.promise().query(
        `SELECT id FROM staff WHERE role = 'nurse' AND status = 'available' LIMIT 1`
      );
      if (nurses && nurses.length > 0) {
        nurse_id = nurses[0].id;
        nurseAssigned = true;
      }
    }

    const [[appointment]] = await db.promise().query(
      'SELECT patient_id, doctor_id FROM appointments WHERE id = ?',
      [appointment_id]
    );
    if (!appointment) throw new Error('Appointment not found');

    const { patient_id, doctor_id } = appointment;

    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        'UPDATE appointments SET status = ?, room_id = ?, is_admitted = TRUE WHERE id = ?',
        ['completed', room_id, appointment_id]
      );

      await conn.query(
        `INSERT INTO admissions (patient_id, appointment_id, room_id, nurse_id, doctor_id, status)
         VALUES (?, ?, ?, ?, ?, 'Admitted')`,
        [patient_id, appointment_id, room_id, nurse_id, doctor_id]
      );

      await conn.query('UPDATE rooms SET status = ? WHERE id = ?', ['occupied', room_id]);

      if (nurseAssigned) {
        await conn.query('UPDATE staff SET status = ? WHERE id = ?', ['unavailable', nurse_id]);
      }

      await conn.commit();

      const successMsg = nurseAssigned
        ? `Patient admitted to Room ${room_number} with nurse assigned`
        : `Patient admitted to Room ${room_number} (no nurse available to assign)`;
      req.flash('success', successMsg);

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
  const { admission_id } = req.body;

  if (!admission_id) {
    req.flash('error', 'Missing admission ID');
    return res.redirect('/staff/dashboard');
  }

  try {
    const conn = await db.promise().getConnection();
    try {
      await conn.beginTransaction();

      const [[admission]] = await conn.query(
        'SELECT room_id, nurse_id FROM admissions WHERE id = ? AND status = "Admitted" FOR UPDATE',
        [admission_id]
      );

      if (!admission) {
        throw new Error('Admission not found or already discharged');
      }

      await conn.query(
        `UPDATE admissions SET status = 'Discharged', discharged_at = NOW() WHERE id = ?`,
        [admission_id]
      );

      await conn.query('UPDATE rooms SET status = "available" WHERE id = ?', [admission.room_id]);

      if (admission.nurse_id) {
        await conn.query('UPDATE staff SET status = "available" WHERE id = ?', [admission.nurse_id]);
      }

      await conn.commit();
      req.flash('success', 'Patient discharged successfully');
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    res.redirect('/staff/dashboard');
  } catch (error) {
    console.error('Discharge error:', error);
    req.flash('error', error.message || 'Failed to discharge patient');
    res.redirect('/staff/dashboard');
  }
});

module.exports = router;
