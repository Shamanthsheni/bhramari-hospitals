const db = require('../config/database');
module.exports = {
  findWithStatus: () =>
    db.promise().query(`
      SELECT r.room_number,
             IF(a.id IS NULL,'Free','Occupied') AS status,
             p.name AS patient_name
      FROM rooms r
      LEFT JOIN admissions a ON r.room_number=a.room_id
      LEFT JOIN patients p ON a.patient_id=p.id
    `)
};
