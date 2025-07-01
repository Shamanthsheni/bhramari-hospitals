const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { ensureStaffOrAdmin } = require('../middleware/authorize');

// MARK ROOM AS FREE
router.post('/free/:room_number', ensureStaffOrAdmin, (req, res) => {
  const roomNumber = req.params.room_number;

  const freeRoomQuery = `
    UPDATE rooms
    SET status = 'Available'
    WHERE room_number = ?
  `;

  // Step 1: Free the room (remove patient & nurse assignment from admissions, appointments)
  const clearAdmissionQuery = `
    UPDATE admissions
    SET status = 'Discharged'
    WHERE room_id = (SELECT id FROM rooms WHERE room_number = ?)
      AND status = 'Admitted'
  `;

  // Step 2: Clear room_id from appointments that are currently admitted in this room
  const clearAppointmentRoomQuery = `
    UPDATE appointments
    SET room_id = NULL, status = 'Completed'
    WHERE room_id = (SELECT id FROM rooms WHERE room_number = ?)
      AND status = 'Admitted'
  `;

  db.query(freeRoomQuery, [roomNumber], (err) => {
    if (err) {
      console.error('Error freeing room:', err);
      req.flash('error', 'Error freeing room');
      return res.redirect('/staff/dashboard');
    }

    db.query(clearAdmissionQuery, [roomNumber], (err2) => {
      if (err2) {
        console.error('Error updating admissions:', err2);
        req.flash('error', 'Error updating admissions');
        return res.redirect('/staff/dashboard');
      }

      db.query(clearAppointmentRoomQuery, [roomNumber], (err3) => {
        if (err3) {
          console.error('Error updating appointments:', err3);
          req.flash('error', 'Error updating appointments');
          return res.redirect('/staff/dashboard');
        }

        req.flash('success', `Room ${roomNumber} marked as free`);
        return res.redirect('/staff/dashboard');
      });
    });
  });
});

// TRANSFER PATIENT & NURSE TO ANOTHER ROOM
router.post('/transfer/:room_number', ensureStaffOrAdmin, (req, res) => {
  const oldRoomNumber = req.params.room_number;
  const { newRoomNumber, patientId, nurseId, appointmentId } = req.body;

  if (!newRoomNumber || !patientId || !nurseId || !appointmentId) {
    req.flash('error', 'Room, patient, nurse, and appointment must be selected');
    return res.redirect('/staff/dashboard');
  }

  // Get room IDs for old and new rooms
  const getRoomIdsQuery = `
    SELECT id, room_number FROM rooms WHERE room_number IN (?, ?)
  `;

  db.query(getRoomIdsQuery, [oldRoomNumber, newRoomNumber], (err, results) => {
    if (err) {
      console.error('Error fetching room IDs:', err);
      req.flash('error', 'Error fetching room details');
      return res.redirect('/staff/dashboard');
    }

    if (results.length !== 2) {
      req.flash('error', 'One or both rooms not found');
      return res.redirect('/staff/dashboard');
    }

    const oldRoom = results.find(r => r.room_number === oldRoomNumber);
    const newRoom = results.find(r => r.room_number === newRoomNumber);

    // Start transaction
    db.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting DB connection:', err);
        req.flash('error', 'Database connection error');
        return res.redirect('/staff/dashboard');
      }

      connection.beginTransaction(err => {
        if (err) {
          connection.release();
          console.error('Transaction error:', err);
          req.flash('error', 'Database transaction error');
          return res.redirect('/staff/dashboard');
        }

        // Step 1: Free old room
        const freeOldRoomQuery = `UPDATE rooms SET status = 'Available' WHERE id = ?`;
        connection.query(freeOldRoomQuery, [oldRoom.id], (err) => {
          if (err) return rollback(connection, req, res, 'Error freeing old room', err);

          // Step 2: Assign patient and nurse to new room & mark as occupied
          const assignNewRoomQuery = `
            UPDATE rooms SET status = 'Occupied' WHERE id = ?
          `;
          connection.query(assignNewRoomQuery, [newRoom.id], (err) => {
            if (err) return rollback(connection, req, res, 'Error updating new room', err);

            // Step 3: Update admissions to point to new room and nurse
            const updateAdmissionQuery = `
              UPDATE admissions SET room_id = ?, nurse_id = ? WHERE patient_id = ? AND status = 'Admitted'
            `;
            connection.query(updateAdmissionQuery, [newRoom.id, nurseId, patientId], (err) => {
              if (err) return rollback(connection, req, res, 'Error updating admission', err);

              // Step 4: Update appointment with new room
              const updateAppointmentQuery = `
                UPDATE appointments SET room_id = ? WHERE id = ?
              `;
              connection.query(updateAppointmentQuery, [newRoom.id, appointmentId], (err) => {
                if (err) return rollback(connection, req, res, 'Error updating appointment', err);

                connection.commit(err => {
                  if (err) return rollback(connection, req, res, 'Error committing transaction', err);

                  connection.release();
                  req.flash('success', 'Patient and nurse transferred successfully');
                  res.redirect('/staff/dashboard');
                });
              });
            });
          });
        });
      });
    });
  });

  function rollback(connection, req, res, message, err) {
    connection.rollback(() => {
      connection.release();
      console.error(message, err);
      req.flash('error', message);
      res.redirect('/staff/dashboard');
    });
  }
});

// ADD NEW ROOM (Admin Only)
router.post('/add', ensureStaffOrAdmin, (req, res) => {
  const { room_number } = req.body;

  if (!room_number) {
    req.flash('error', 'Room number is required');
    return res.redirect('/admin/dashboard');
  }

  const checkRoomExistsQuery = 'SELECT COUNT(*) AS count FROM rooms WHERE room_number = ?';
  const insertRoomQuery = 'INSERT INTO rooms (room_number, status) VALUES (?, "Available")';

  db.query(checkRoomExistsQuery, [room_number], (err, results) => {
    if (err) {
      console.error('Error checking room existence:', err);
      req.flash('error', 'Error checking room number');
      return res.redirect('/admin/dashboard');
    }

    if (results[0].count > 0) {
      req.flash('error', 'Room number already exists');
      return res.redirect('/admin/dashboard');
    }

    db.query(insertRoomQuery, [room_number], (err2) => {
      if (err2) {
        console.error('Error adding new room:', err2);
        req.flash('error', 'Error adding room');
      } else {
        req.flash('success', `Room ${room_number} added successfully`);
      }
      res.redirect('/admin/dashboard');
    });
  });
});

module.exports = router;
