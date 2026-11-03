
const mongoose = require('mongoose');

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function isValidId(value) {
    return typeof value === 'string' &&
        /^[0-9a-fA-F]{24}$/.test(value) &&
        mongoose.isObjectIdOrHexString(value);
}

function isValidDate(value) {
    return (
        (typeof value === 'string' || value instanceof Date) &&
        !Number.isNaN(new Date(value).getTime())
    );
}

function sendError(res, status, message) {
    return res.status(status).json({
        message,
        data: null
    });
}

function handleError(res, error) {
    console.error(error);

    if (error.code === 11000) {
        return sendError(res, 400, 'A user with this email already exists');
    }

    if (
        error.name === 'ValidationError' ||
        error.name === 'CastError'
    ) {
        return sendError(res, 400, 'Invalid request data');
    }

    return sendError(res, 500, 'An unexpected server error occurred');
}

module.exports = {
    isNonEmptyString,
    isValidId,
    isValidDate,
    sendError,
    handleError
};
