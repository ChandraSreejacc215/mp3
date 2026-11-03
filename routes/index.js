/*
 * Connect all of your endpoints together here.
 */
// module.exports = function (app, router) {
//     app.use('/api', require('./home.js')(router));
// };

// import express from 'express';

// module.exports = function (app) {
//     app.use('/api/users', require('./users'));
//     app.use('/api/tasks', require('./tasks'));
// };



module.exports = function (app) {
    // app.use('/api', require('./home'));
    app.use('/api/users', require('./users'));
    app.use('/api/tasks', require('./tasks'));
};


