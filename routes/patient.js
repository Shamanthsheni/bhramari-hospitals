const express = require("express");
const router = express.Router();
const db = require("../config/database");

// Patient Dashboard
router.get("/dashboard", (req, res) => {
  if (!req.session.user || req.session.role !== "patient") {
    return res.redirect("/auth/login?type=patient");
  }

  const userId = req.session.user.id;

  const patientInfoQuery = `SELECT * FROM patients WHERE user_id = ?`;

  const appointmentsQuery = `
    SELECT 
      a.id, 
      a.appointment_date, 
      a.start_time, 
      CONCAT(s.first_name, ' ', s.last_name) AS staff_name
    FROM appointments a
    JOIN staff s ON a.doctor_id = s.id
    WHERE a.patient_id = ?
    ORDER BY a.appointment_date ASC, a.start_time ASC
  `;

 const admissionQuery = `
  SELECT 
    ad.status AS admission_status,
    s.first_name AS assigned_nurse,
    r.room_number
  FROM admissions ad
  LEFT JOIN staff s ON ad.nurse_id = s.id
  LEFT JOIN rooms r ON ad.room_id = r.id
  WHERE ad.patient_id = ? AND ad.status = 'Admitted'
  ORDER BY ad.admitted_at DESC
  LIMIT 1
`;


  const prescriptionsQuery = `
    SELECT diagnosis, treatment, date
    FROM prescriptions
    WHERE patient_id = ?
    ORDER BY date DESC
  `;

  const doctorsQuery = `
    SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS name
    FROM staff s
    JOIN users u ON s.user_id = u.id
    WHERE u.role = 'doctor'
  `;

  db.query(patientInfoQuery, [userId], (err0, patientInfo) => {
    if (err0 || patientInfo.length === 0) {
      console.error("Error fetching patient info:", err0);
      return res.send("Error loading patient info");
    }

    const patient = patientInfo[0];

    db.query(appointmentsQuery, [patient.id], (err1, appointments) => {
      if (err1) {
        console.error("Error fetching appointments:", err1);
        return res.send("Error fetching appointments");
      }

      db.query(admissionQuery, [patient.id], (err2, results) => {
        if (err2) {
          console.error("Error fetching admission data:", err2);
          return res.send("Error fetching admission data");
        }

        db.query(prescriptionsQuery, [patient.id], (err3, prescriptions) => {
          if (err3) {
            console.error("Error fetching prescriptions:", err3);
            return res.send("Error fetching prescriptions");
          }

          db.query(doctorsQuery, (err4, doctors) => {
            if (err4) {
              console.error("Error fetching doctors:", err4);
              return res.send("Error fetching doctors");
            }

            const admissionInfo =
              results.length > 0
                ? results[0]
                : {
                    admission_status: "Discharged",
                    assigned_nurse: null,
                    room_number: null,
                  };

            res.render("patient-dashboard", {
              user: {
                first_name: patient.first_name,
                last_name: patient.last_name,
                id: patient.id,
              },
              appointments,
              admissionInfo,
              prescriptions,
              doctors,
            });
          });
        });
      });
    });
  });
});

// Admit Patient
router.post("/admit", async (req, res) => {
  if (!req.session.user || req.session.role !== "patient") {
    return res.redirect("/auth/login?type=patient");
  }

  const userId = req.session.user.id;

  try {
    const [[patient]] = await db
      .promise()
      .query("SELECT id FROM patients WHERE user_id = ?", [userId]);

    if (!patient) {
      return res.status(404).send("Patient not found.");
    }

    const patientId = patient.id;

    // Check if already admitted
    const [[admission]] = await db
      .promise()
      .query(
        "SELECT id FROM appointments WHERE patient_id = ? AND status = 'admitted' LIMIT 1",
        [patientId]
      );

    if (admission) {
      return res.send("You are already admitted.");
    }

    // Get free room
    const [rooms] = await db
      .promise()
      .query("SELECT * FROM rooms WHERE is_occupied = 0 LIMIT 1");

    if (rooms.length === 0) return res.send("No rooms available.");

    const room = rooms[0];

    // Get nurse with least load
    const [nurses] = await db.promise().query(`
      SELECT s.id FROM staff s
      LEFT JOIN appointments a ON s.id = a.nurse_id
      WHERE s.role = 'Nurse'
      GROUP BY s.id
      ORDER BY COUNT(a.id) ASC
      LIMIT 1
    `);

    if (nurses.length === 0) return res.send("No nurses available.");

    const nurse = nurses[0];

    // Update room
    await db
      .promise()
      .query(
        "UPDATE rooms SET is_occupied = 1, assigned_patient = ?, assigned_nurse_id = ? WHERE id = ?",
        [patientId, nurse.id, room.id]
      );

    // Get earliest scheduled appointment
    const [appointmentRows] = await db
      .promise()
      .query(
        "SELECT id FROM appointments WHERE patient_id = ? AND status = 'scheduled' ORDER BY appointment_date ASC LIMIT 1",
        [patientId]
      );

    if (appointmentRows.length === 0) {
      return res.send("No scheduled appointment found to admit.");
    }

    const appointmentId = appointmentRows[0].id;

    // Admit the patient
    await db
      .promise()
      .query(
        `UPDATE appointments 
         SET status = 'admitted', room_id = ?, nurse_id = ? 
         WHERE id = ?`,
        [room.id, nurse.id, appointmentId]
      );

    res.redirect("/patient/dashboard");
  } catch (err) {
    console.error("Admit error:", err);
    res.status(500).send("Error admitting patient.");
  }
});

module.exports = router;
