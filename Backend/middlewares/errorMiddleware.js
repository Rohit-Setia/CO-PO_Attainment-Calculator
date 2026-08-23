const errorHandler = (err, req, res, next) => {
  // Full error (including raw DB driver messages) is always logged server-side for debugging.
  console.error(err);

  // Malformed JSON bodies (express.json SyntaxError) are client errors, not server failures.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON body.' });
  }
  // Payload too large (e.g. Excel import exceeding the configured JSON limit).
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request payload too large.' });
  }
  // CORS rejections are explicit 403s with a real status.
  if (err.status === 403) {
    return res.status(403).json({ success: false, message: err.message || 'Forbidden.' });
  }

  // MySQL "Incorrect integer/date value" errors (strict mode) mean the client sent a
  // malformed id/date/status — an input-validation problem, so report 400 not 500.
  if (err.code === 'ER_TRUNCATED_WRONG_VALUE' || err.code === 'ER_WRONG_VALUE' || err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_DATA_TOO_LONG') {
    return res.status(400).json({ success: false, message: 'Invalid value in request.' });
  }

  const status = err.status || 500;
  // Only trust err.message for errors intentionally thrown by application code with an explicit
  // status (e.g. `throw Object.assign(new Error('...'), { status: 400 })`). Anything that fell
  // through to a generic catch block (no status set) is an unexpected failure — usually a raw
  // DB driver error — and must not be echoed to the client verbatim.
  const message = err.status ? err.message : 'Internal server error. Please try again.';

  res.status(status).json({
    success: false,
    message,
  });
};

module.exports = errorHandler;
