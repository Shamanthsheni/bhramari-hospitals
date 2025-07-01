const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');

// GET: Login page for patient or staff
router.get('/login', (req, res) => {
  const type = req.query.type;
  if (type === 'patient' || type === 'staff') {
    return res.render('login', { role: type, error: null });
  }
  res.redirect('/');
});

// POST: Handle login
router.post('/login', (req, res) => {
  const { role, username, password } = req.body;
  console.log("Login Request:", req.body);

  if (!role || !username || !password) {
    return renderLoginError(res, role || 'staff', 'All fields are required');
  }

  if (role === 'patient') {
    // Patient login
    const query = 'SELECT * FROM users WHERE username = ? OR email = ? AND role = "patient"';
    db.query(query, [username, username], (err, results) => {
      if (err) {
        console.error('DB error:', err);
        return renderLoginError(res, 'patient', 'Login error');
      }
      if (results.length === 0) {
        return renderLoginError(res, 'patient', 'Invalid credentials');
      }

      const patientUser = results[0];
      bcrypt.compare(password, patientUser.password, (err, isMatch) => {
        if (err || !isMatch) {
          return renderLoginError(res, 'patient', 'Invalid credentials');
        }
        // Set session with users.id for patient
        req.session.user = {
          id: patientUser.id,
          username: patientUser.username,
          email: patientUser.email,
          role: 'patient'
        };
        req.session.role = 'patient';
        res.redirect('/patient/dashboard');
      });
    });

  } else if (role === 'staff') {
    // Staff login
    const query = 'SELECT * FROM users WHERE (username = ? OR email = ?) AND role != "patient"';
    db.query(query, [username, username], (err, userResults) => {
      if (err) {
        console.error('DB error:', err);
        return renderLoginError(res, 'staff', 'Login error');
      }
      if (userResults.length === 0) {
        return renderLoginError(res, 'staff', 'Invalid credentials');
      }

      const user = userResults[0];
      bcrypt.compare(password, user.password, (err, isMatch) => {
        if (err || !isMatch) {
          return renderLoginError(res, 'staff', 'Invalid credentials');
        }

        // Lookup staff by user_id
        db.query('SELECT * FROM staff WHERE user_id = ?', [user.id], (err2, staffResults) => {
          if (err2) {
            console.error('Staff lookup failed:', err2);
            return renderLoginError(res, 'staff', 'Staff profile not found');
          }
          if (staffResults.length === 0) {
            return renderLoginError(res, 'staff', 'Staff profile not found');
          }

          const staff = staffResults[0];
          // Store session with staff.id for staff, include name and position
          req.session.user = {
            id: staff.id,
            name: `${staff.first_name} ${staff.last_name}`,
            position: staff.position,
            role: user.role.toLowerCase()
          };
          req.session.role = user.role.toLowerCase();

          if (user.role.toLowerCase() === 'admin') {
            return res.redirect('/admin/dashboard');
          }
          res.redirect('/staff/dashboard');
        });
      });
    });

  } else {
    res.redirect('/');
  }
});

// GET: Patient registration page
router.get('/register/patient', (req, res) => {
  res.render('register-patient', { error: null });
});

// POST: Patient registration
router.post('/register/patient', (req, res) => {
  const {
    first_name,
    last_name,
    username,
    email,
    password,
    date_of_birth,
    gender,
    phone,
    address,
  } = req.body;

  if (!first_name || !last_name || !username || !email || !password || !date_of_birth || !gender || !phone) {
    return res.render('register-patient', { error: 'All fields are required' });
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Hashing error:', err);
      return res.render('register-patient', { error: 'Internal error' });
    }

    const insertUser = `INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, 'patient')`;
    db.query(insertUser, [username, email, hashedPassword], (err, result) => {
      if (err) {
        console.error('User insert error:', err);
        return res.render('register-patient', { error: 'Username or email already exists' });
      }

      const user_id = result.insertId;
      const insertPatient = `
        INSERT INTO patients (user_id, first_name, last_name, date_of_birth, gender, phone, address)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

      db.query(insertPatient, [user_id, first_name, last_name, date_of_birth, gender, phone, address], (err2) => {
        if (err2) {
          console.error('Patient insert error:', err2);
          return res.render('register-patient', { error: 'Error creating patient profile' });
        }

        res.redirect('/auth/login?type=patient');
      });
    });
  });
});

// Utility function to render login with error message
function renderLoginError(res, role, message) {
  return res.render('login', { role, error: message });
}

module.exports = router;
