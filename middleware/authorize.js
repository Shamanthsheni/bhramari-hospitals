function ensureStaffOrAdmin(req, res, next) {
  const role = req.session?.role?.toLowerCase();
  if (role === 'doctor' || role === 'nurse' || role === 'admin') {
    return next();
  }
  req.flash('error', 'Access denied. Only authorized staff can access this section.');
  return res.redirect('/auth/login?type=staff');
}

module.exports = { ensureStaffOrAdmin };
