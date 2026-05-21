'use strict';

/**
 * Emit one structured JSON log line per HTTP request with duration.
 */
function logger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    console.log(
      JSON.stringify({
        level: 'info',
        ts: new Date().toISOString(),
        msg: 'http_request',
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        duration_ms: Date.now() - start,
        ip: req.ip,
      })
    );
  });

  next();
}

module.exports = logger;
