// models/doctorModel.js (same as nurseModel but role filter)
const db = require('../config/database');
module.exports = {
  findByRole: (role) =>
    db.promise().query('SELECT id,name,specialization FROM staff WHERE role=?', [role])
};
