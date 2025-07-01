const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Staff registration page
router.get('/staff/register', (req, res) => {
  res.render('register-staff', { error: null });
});

// Admin registration page
router.get('/register/admin', (req, res) => {
  res.render('register-admin', { error: null });
});

// Handle staff registration
router.post('/staff/register', (req, res) => {
  const { name, username, password, role, email, specialization } = req.body;
  const finalSpecialization = role === 'Doctor' ? specialization : null;

  db.query(
    'INSERT INTO staff (name, username, password, role, email, specialization) VALUES (?, ?, ?, ?, ?, ?)',
    [name, username, password, role, email, finalSpecialization],
    (err) => {
      if (err) {
        console.error(err);
        return res.render('register-staff', { error: 'Error registering staff. Try a different username.' });
      }
      res.redirect('/login?type=staff');
    }
  );
});

// Handle admin registration with secure key
router.post('/register/admin', (req, res) => {
  const { name, username, password, email, adminKey } = req.body;
  if (adminKey !== '@22Shamanth') {
    return res.render('register-admin', { error: 'Invalid Admin Key' });
  }

  db.query(
    'INSERT INTO staff (name, username, password, role, email) VALUES (?, ?, ?, "Admin", ?)',
    [name, username, password, email],
    (err) => {
      if (err) {
        console.error(err);
        return res.render('register-admin', { error: 'Error registering admin.' });
      }
      res.redirect('/login?type=staff');
    }
  );
});

module.exports = router;
