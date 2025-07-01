const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Book new appointment
router.post("/book", (req, res) => {
  if (!req.session.user || req.session.role !== "patient") {
    return res.redirect("/auth/login?type=patient");
  }

  const userId = req.session.user.id;

  db.query("SELECT id FROM patients WHERE user_id = ?", [userId], (err, results) => {
    if (err || results.length === 0) {
      console.error("Error getting patient ID:", err);
      return res.status(500).send("Error booking appointment.");
    }

    const patient_id = results[0].id;
    const { doctor_id, date, time, reason } = req.body;

    const sql = `
      INSERT INTO appointments (patient_id, doctor_id, appointment_date, start_time, end_time, notes, status) 
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
    `;

    db.query(sql, [patient_id, doctor_id, date, time, time, reason], (err2) => {
      if (err2) {
        console.error("Error booking appointment:", err2);
        return res.status(500).send("Error booking appointment");
      }
      res.redirect("/patient/dashboard");
    });
  });
});

// Cancel appointment
router.post("/cancel/:id", (req, res) => {
  db.query(`DELETE FROM appointments WHERE id = ?`, [req.params.id], (err) => {
    if (err) return res.status(500).send("Error cancelling appointment");
    res.redirect("/patient/dashboard");
  });
});

// View patient's appointments
router.get("/patient/:id", (req, res) => {
  const sql = `
    SELECT a.*, CONCAT(s.first_name, ' ', s.last_name) AS staff_name 
    FROM appointments a 
    JOIN staff s ON a.doctor_id = s.id 
    WHERE a.patient_id = ? 
    ORDER BY a.appointment_date, a.start_time 
  `;

  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).send("Error fetching appointments");
    res.render("appointments", { appointments: results, role: "patient" });
  });
});

// View doctor's appointments
router.get("/doctor/:id", (req, res) => {
  const sql = `
    SELECT a.*, p.first_name AS patient_name, p.last_name AS patient_last_name
    FROM appointments a
    JOIN patients p ON a.patient_id = p.id
    WHERE a.doctor_id = ? 
    ORDER BY a.appointment_date, a.start_time
  `;

  db.query(sql, [req.params.id], (err, results) => {
    if (err) return res.status(500).send("Error fetching appointments");
    res.render("doctor-appointments", { appointments: results });
  });
});

// Filter appointments
router.get("/filter", (req, res) => {
  const { date, status } = req.query;

  const userId = req.session.user.id;

  db.query("SELECT id FROM patients WHERE user_id = ?", [userId], (err, results) => {
    if (err || results.length === 0) return res.status(500).send("Patient not found");

    const patientId = results[0].id;
    let sql = `
      SELECT a.*, CONCAT(s.first_name, ' ', s.last_name) AS staff_name 
      FROM appointments a
      JOIN staff s ON a.doctor_id = s.id
      WHERE a.patient_id = ?
    `;
    const params = [patientId];

    if (date) {
      sql += " AND a.appointment_date = ?";
      params.push(date);
    }
    if (status) {
      sql += " AND a.status = ?";
      params.push(status);
    }

    sql += " ORDER BY a.appointment_date, a.start_time";

    db.query(sql, params, (err2, results2) => {
      if (err2) return res.status(500).send("Error fetching filtered appointments");
      res.render("doctor-appointments", {
        appointments: results2,
        filterDate: date || "",
        filterStatus: status || "",
      });
    });
  });
});

module.exports = router;
