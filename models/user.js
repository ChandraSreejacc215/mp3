// Load required packages
const mongoose = require('mongoose');

// Define our user schema
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    pendingTasks: {
        type: [String],
        default: []
    },
    dateCreated: {
        type: Date,
        default: Date.now,
        immutable: true
    }
});

// Export the Mongoose model
module.exports = mongoose.model('User', userSchema);
