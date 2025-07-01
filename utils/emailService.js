const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send appointment confirmation email
const sendConfirmationEmail = (patientEmail, appointmentDetails) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ Email credentials are missing in .env");
    return;
  }

  const mailOptions = {
    from: `"Bhramari Hospitals" <${process.env.EMAIL_USER}>`,
    to: patientEmail,
    subject: 'Appointment Confirmation',
    html: `
      <h3>Appointment Confirmed</h3>
      <p>Your appointment is scheduled for <strong>${appointmentDetails.date}</strong> at <strong>${appointmentDetails.time}</strong> with <strong>Dr. ${appointmentDetails.doctorName}</strong>.</p>
      <p>Thank you for choosing Bhramari Hospitals.</p>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('❌ Email sending failed:', error);
    } else {
      console.log('📧 Email sent:', info.response);
    }
  });
};

module.exports = { sendConfirmationEmail };
