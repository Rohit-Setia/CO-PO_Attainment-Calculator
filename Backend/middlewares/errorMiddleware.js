const errorHandler = (err, req, res, next) => {
  // Full error (including raw DB driver messages) is always logged server-side for debugging.
  console.error(err);

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
