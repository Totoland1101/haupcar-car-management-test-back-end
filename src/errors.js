class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: { message: `Route ${req.method} ${req.originalUrl} not found` },
  });
}

// Express recognises error handlers by their four arguments, so `next` has to stay.
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { message: err.message, details: err.details },
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { message: 'The upload is too large' } });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { message: 'Request body is not valid JSON' } });
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Something went wrong on the server' } });
}

module.exports = { HttpError, notFoundHandler, errorHandler };
