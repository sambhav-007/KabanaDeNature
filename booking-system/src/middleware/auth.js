'use strict';

const { verify, parseCookies, COOKIE } = require('../auth');

function requireAdmin(req, res, next) {
  const payload = verify(parseCookies(req)[COOKIE]);
  if (payload && payload.admin) { req.admin = payload; return next(); }
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { requireAdmin };
