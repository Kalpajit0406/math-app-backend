const ApiError = require('../utils/apiError');

const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || (error.name === 'ValidationError' ? 400 : 500);
    const message = error.message || 'Something went wrong';
    error = new ApiError(statusCode, message, err.errors || [], err.stack);
  }

  console.error(`[Error Handler] ${error.statusCode} - ${error.message}`);
  if (error.statusCode === 500) {
    console.error(error.stack);
  }

  const response = {
    success: false,
    message: error.message,
    errors: error.errors
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(error.statusCode).json(response);
};

module.exports = errorHandler;
