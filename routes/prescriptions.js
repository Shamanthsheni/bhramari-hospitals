const express = require('express');
const router = express.Router();
const db = require('../config/database');

// POST: Create prescription & complete appointment
router.post('/create', (req, res) => {
  const { patient_id, appointment_id, diagnosis, treatment } = req.body;
  const doctor_id = req.session.user.id;

  // Validate inputs
  if (!patient_id || !appointment_id || !diagnosis || !treatment) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/staff/dashboard');
  }

  // Insert new prescription
  const insertSql = `
    INSERT INTO prescriptions
      (patient_id, doctor_id, diagnosis, treatment, date)
    VALUES (?, ?, ?, ?, CURDATE())
  `;
  // Mark that appointment completed
  const updateApptSql = `
    UPDATE appointments
    SET status = 'completed'
    WHERE id = ?
  `;

  db.query(insertSql, [patient_id, doctor_id, diagnosis, treatment], (err) => {
    if (err) {
      console.error('Error creating prescription:', err);
      req.flash('error', 'Error saving prescription.');
      return res.redirect('/staff/dashboard');
    }
    db.query(updateApptSql, [appointment_id], (err2) => {
      if (err2) {
        console.error('Error marking appointment completed:', err2);
        req.flash('warning', 'Prescription saved, but failed to complete appointment.');
      } else {
        req.flash('success', 'Prescription saved and appointment completed.');
      }
      // Return to doctor dashboard
      res.redirect('/staff/dashboard');
    });
  });
});

// GET: Show create prescription form + previous prescriptions
router.get('/new', (req, res) => {
  const doctor_id = req.session.user?.id;
  const { patient_id, appointment_id } = req.query;

  if (!doctor_id || !patient_id || !appointment_id) {
    req.flash('error', 'Missing patient or appointment ID.');
    return res.redirect('/staff/dashboard');
  }

  // Fetch patient name
  const patientSql = `
    SELECT id, CONCAT(first_name, ' ', last_name) AS name
    FROM patients
    WHERE id = ?
  `;
  // Fetch past prescriptions
  const pastSql = `
    SELECT diagnosis, treatment, date
    FROM prescriptions
    WHERE patient_id = ?
    ORDER BY date DESC
  `;

  db.query(patientSql, [patient_id], (err, pRes) => {
    if (err || !pRes.length) {
      req.flash('error', 'Patient not found.');
      return res.redirect('/staff/dashboard');
    }
    const patient = pRes[0];

    db.query(pastSql, [patient_id], (err2, pastPrescriptions) => {
      if (err2) {
        req.flash('error', 'Error loading past prescriptions.');
        return res.redirect('/staff/dashboard');
      }

      res.render('prescriptions', {
        patient,
        appointment_id,
        prescriptions: pastPrescriptions,
        success: req.flash('success'),
        error:   req.flash('error')
      });
    });
  });
});

module.exports = router;
