const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

const staffRegisterRouter = require('./routes/staff-register');
const staffRouter = require('./routes/staff');
const patientRouter = require('./routes/patient');
const appointmentRouter = require('./routes/appointment');
const authRouter = require('./routes/auth');
const roomsRouter = require('./routes/rooms');
const adminRouter = require('./routes/admin');
const prescriptionsRouter = require('./routes/prescriptions');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(flash());
app.use(session({
  secret: 'your-secret-key',  // Change this for production
  resave: false,
  saveUninitialized: true,
}));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Flash messages
app.use((req, res, next) => {
  res.locals.success = req.flash('success') || [];
  res.locals.error = req.flash('error') || [];
  next();
});

// Routes
app.use('/staff/register', staffRegisterRouter);
app.use('/staff', staffRouter);  // Includes all admit/discharge logic
app.use('/patient', patientRouter);
app.use('/appointments', appointmentRouter);
app.use('/auth', authRouter);
app.use('/rooms', roomsRouter);
app.use('/admin', adminRouter);
app.use('/prescriptions', prescriptionsRouter);

// Home page
app.get('/', (req, res) => {
  res.render('index');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
