const db = require('../config/database');
module.exports = {
  findAll: () => db.promise().query('SELECT * FROM patients'),
  create: (data) =>
    db.promise().query(
      `INSERT INTO patients (name,age,gender,contact,username,password)
       VALUES (?,?,?,?,?,?)`,
      [data.name,data.age,data.gender,data.contact,data.username,data.password]
    )
};
