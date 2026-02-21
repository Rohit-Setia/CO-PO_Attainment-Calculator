const jwt = require('jsonwebtoken');

const generateToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || 'replace_this_in_prod', {
    expiresIn: '1d',
  });

module.exports = generateToken;
