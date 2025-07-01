const express = require('express');
const router = express.Router();
const db = require('../config/database');  // Your original path was ../config/database
const bcrypt = require('bcrypt');

// Middleware to check admin session
function ensureAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role.toLowerCase() !== 'admin') {
    return res.redirect('/auth/login?type=admin');
  }
  next();
}

// Admin Dashboard
router.get('/dashboard', ensureAdmin, (req, res) => {
  const admin = req.session.user;

  const roomsQuery = `
    SELECT 
      r.*, 
      CASE WHEN a.status = 'Admitted' THEN 'Occupied' ELSE 'Available' END AS room_status,
      CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
      CONCAT(s.first_name, ' ', s.last_name) AS nurse_name
    FROM rooms r
    LEFT JOIN admissions a ON r.id = a.room_id AND a.status = 'Admitted'
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN staff s ON a.nurse_id = s.id
    ORDER BY r.room_number;
  `;

  db.query(roomsQuery, (err, roomResults) => {
    if (err) {
      console.error('Error fetching rooms:', err);
      return renderAdmin([], 0, [], [], [], 'Error loading rooms');
    }

    db.query('SELECT COUNT(*) AS total FROM appointments', (err, totalRes) => {
      if (err) {
        console.error('Error fetching total appointments:', err);
        return renderAdmin(roomResults, 0, [], [], [], 'Error loading appointment stats');
      }

      const totalAppointments = totalRes[0].total;

      const doctorStatsQuery = `
        SELECT CONCAT(s.first_name, ' ', s.last_name) AS doctor_name, COUNT(*) AS count
        FROM appointments a
        JOIN staff s ON a.doctor_id = s.id
        WHERE LOWER(s.role) = 'doctor'
        GROUP BY doctor_name;
      `;

      db.query(doctorStatsQuery, (err, doctorStats) => {
        if (err) {
          console.error('Error fetching doctor stats:', err);
          return renderAdmin(roomResults, totalAppointments, [], [], [], 'Error loading doctor stats');
        }

        const patientsQuery = `
          SELECT 
            p.id, 
            CONCAT(p.first_name, ' ', p.last_name) AS name, 
            u.username, u.email, p.phone, 
            IFNULL(a.status, 'Not Admitted') AS admission_status,
            a.room_id
          FROM patients p
          LEFT JOIN users u ON p.user_id = u.id
          LEFT JOIN (
            SELECT a1.*
            FROM admissions a1
            INNER JOIN (
              SELECT patient_id, MAX(admitted_at) AS max_admitted_at
              FROM admissions
              GROUP BY patient_id
            ) a2 ON a1.patient_id = a2.patient_id AND a1.admitted_at = a2.max_admitted_at
          ) a ON p.id = a.patient_id;
        `;

        db.query(patientsQuery, (err, patientResults) => {
          if (err) {
            console.error('Error fetching patients:', err);
            return renderAdmin(roomResults, totalAppointments, doctorStats, [], [], 'Error loading patients');
          }

          const staffQuery = `
            SELECT 
              s.id, 
              CONCAT(s.first_name, ' ', s.last_name) AS name, 
              u.username, 
              COALESCE(u.email, s.email, '-') AS email, 
              s.role, 
              COALESCE(NULLIF(s.specialty, ''), '-') AS specialty, 
              COALESCE(NULLIF(s.phone, ''), '-') AS phone
            FROM staff s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE LOWER(s.role) != 'admin';
          `;

          db.query(staffQuery, (err, staffResults) => {
            if (err) {
              console.error('Error fetching staff:', err);
              return renderAdmin(roomResults, totalAppointments, doctorStats, patientResults, [], 'Error loading staff');
            }

            renderAdmin(roomResults, totalAppointments, doctorStats, patientResults, staffResults, null);
          });
        });
      });
    });
  });

  function renderAdmin(rooms, totalAppointments, appointmentsByDoctor, patients, staffList, errorMsg) {
    res.render('admin-dashboard', {
      admin,
      rooms,
      totalAppointments,
      appointmentsByDoctor,
      patients,
      staff: staffList,
      success_msg: req.flash('success_msg'),
      error_msg: errorMsg || req.flash('error_msg')
    });
  }
});

// Add Room
router.post('/rooms/add', ensureAdmin, (req, res) => {
  const { room_number } = req.body;

  if (!room_number) {
    req.flash('error_msg', 'Room number is required');
    return res.redirect('/admin/dashboard');
  }

  db.query('SELECT id FROM rooms WHERE room_number = ?', [room_number], (err, results) => {
    if (err) {
      console.error('Error checking room number:', err);
      req.flash('error_msg', 'Database error while adding room.');
      return res.redirect('/admin/dashboard');
    }

    if (results.length > 0) {
      req.flash('error_msg', 'Room number already exists.');
      return res.redirect('/admin/dashboard');
    }

    db.query(
      'INSERT INTO rooms (room_number, room_type, capacity, status) VALUES (?, "examination", 1, "available")',
      [room_number],
      (err) => {
        if (err) {
          console.error('Error adding room:', err);
          req.flash('error_msg', 'Error adding room.');
        } else {
          req.flash('success_msg', 'Room added successfully.');
        }
        res.redirect('/admin/dashboard');
      }
    );
  });
});

// Admin Registration Page
router.get('/register', (req, res) => {
  res.render('register-admin', { error: null });
});

// Handle Admin Registration
router.post('/register', (req, res) => {
  const { name, username, password, email, adminKey } = req.body;

  if (adminKey !== '@22Shamanth') {
    return res.render('register-admin', { error: 'Invalid Admin Key' });
  }

  if (!name || !username || !password || !email) {
    return res.render('register-admin', { error: 'All fields are required' });
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error(err);
      return res.render('register-admin', { error: 'Error hashing password' });
    }

    db.query('SELECT id FROM users WHERE username = ?', [username], (err, results) => {
      if (err) {
        console.error(err);
        return res.render('register-admin', { error: 'Database error' });
      }

      if (results.length > 0) {
        return res.render('register-admin', { error: 'Username already taken' });
      }

      db.query(
        'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, email, 'admin'],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.render('register-admin', { error: 'Error registering admin' });
          }

          const userId = result.insertId;
          db.query(
            'INSERT INTO staff (user_id, first_name, role) VALUES (?, ?, ?)',
            [userId, name, 'Admin'],
            (err) => {
              if (err) {
                console.error('Warning: Admin not inserted into staff table:', err);
              }

              req.flash('success_msg', 'Admin registered successfully. Please log in.');
              res.redirect('/auth/login?type=admin');
            }
          );
        }
      );
    });
  });
});

// Transfer Appointments
router.post('/transfer-appointment', ensureAdmin, (req, res) => {
  const { fromDoctorId, toDoctorId } = req.body;

  if (!fromDoctorId || !toDoctorId) {
    req.flash('error_msg', 'Both doctor IDs are required');
    return res.redirect('/admin/dashboard');
  }

  db.query(
    'UPDATE appointments SET doctor_id = ? WHERE doctor_id = ? AND status = "Pending"',
    [toDoctorId, fromDoctorId],
    (err) => {
      if (err) {
        console.error('Error transferring appointments:', err);
        req.flash('error_msg', 'Database error while transferring appointments.');
        return res.redirect('/admin/dashboard');
      }
      req.flash('success_msg', 'Appointments transferred successfully.');
      res.redirect('/admin/dashboard');
    }
  );
});

module.exports = router;
