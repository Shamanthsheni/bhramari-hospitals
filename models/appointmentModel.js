const db = require('../config/database');
module.exports = {
  findByPatient: (patientId) =>
    db.promise().query(
      `SELECT a.date, s.name AS doctor_name
       FROM appointments a JOIN staff s ON a.doctor_id=s.id
       WHERE a.patient_id=?`, [patientId]
    )
};
