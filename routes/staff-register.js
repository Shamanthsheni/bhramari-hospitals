const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/database'); // MySQL2 connection assumed

// GET: Render staff registration form
router.get('/', (req, res) => {
  res.render('register-staff', { error: null, formData: {} });
});

// POST: Handle staff registration
router.post('/', async (req, res) => {
  const {
    first_name,
    last_name,
    username,
    password,
    email,
    role,
    specialty,
    position,
    phone,
  } = req.body;

  const formData = req.body;

  // Basic validation
  if (
    !first_name || !last_name || !username || !password || !email ||
    !role || !position || !phone
  ) {
    return res.render('register-staff', {
      error: 'All fields are required',
      formData,
    });
  }

  if (role.toLowerCase() === 'doctor' && !specialty) {
    return res.render('register-staff', {
      error: 'Specialization is required for doctors',
      formData,
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const conn = db.promise();

    // Step 1: Insert into users
    const [userResult] = await conn.query(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hashedPassword, role.toLowerCase()]
    );

    const userId = userResult.insertId;

    // Step 2: Insert into staff
    const [staffResult] = await conn.query(
      `INSERT INTO staff (user_id, first_name, last_name, specialty, position, phone, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        first_name,
        last_name,
        role.toLowerCase() === 'doctor' ? specialty.toLowerCase() : null,
        position,
        phone,
        role.toLowerCase()
      ]
    );

    // Success: Redirect to login
    res.redirect('/auth/login?type=staff');

  } catch (err) {
    console.error('Registration error:', err);

    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.render('register-staff', {
        error: 'Username or email is already in use',
        formData,
      });
    }

    // Rollback user if created
    if (err.insertId) {
      try {
        await db.promise().query('DELETE FROM users WHERE id = ?', [err.insertId]);
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr);
      }
    }

    res.render('register-staff', {
      error: 'Internal error occurred during registration',
      formData,
    });
  }
});

module.exports = router;
