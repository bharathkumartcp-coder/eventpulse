const { validationResult } = require('express-validator');

/**
 * Middleware to check express-validator results.
 * If there are validation errors, responds with 422 and the first error message.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    return res.status(422).json({
      error: firstError.msg,
      field: firstError.path,
    });
  }
  next();
}

module.exports = { validate };
