const express = require('express');
const router = express.Router();
const User = require('../models/user');
const mongoose = require('mongoose');
const Task = require('../models/task');
const { getCollection } = require('../utils/query');


router.get('/', async (req, res) => {
    try {
        const users = await getCollection(User, req.query, null);

        return res.status(200).json({
            message: 'OK',
            data: users
        });
    } catch (error) {
        if (error.message.startsWith('Invalid ')) {
            return sendError(res, 400, error.message);
        }
        return handleError(res, error);
    }
});



const {
    isNonEmptyString,
    isValidId,
    sendError,
    handleError
} = require('../utils/validation');



router.post('/', async (req, res) => {
    try {
        const body = req.body;

        if (!body || typeof body !== 'object' ||
            Array.isArray(body)) {
            return sendError(res, 400, 'Invalid request body');
        }

        const { name, email, pendingTasks = [] } = body;

        if (!isNonEmptyString(name) ||
            !isNonEmptyString(email)) {
            return sendError(res, 400,
                'Name and email are required');
        }

        if (!Array.isArray(pendingTasks) ||
            !pendingTasks.every(isValidId)) {
            return sendError(res, 400,
                'Invalid pendingTasks IDs');
        }

        if (new Set(pendingTasks).size !== pendingTasks.length) {
            return sendError(res, 400,
                'Duplicate task IDs are not allowed');
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return sendError(res, 400,
                'A user with this email already exists');
        }

        const tasks = await Task.find({
            _id: { $in: pendingTasks }
        });

        if (tasks.length !== pendingTasks.length) {
            return sendError(res, 404,
                'One or more tasks do not exist');
        }

        if (tasks.some(task => task.completed)) {
            return sendError(res, 400,
                'Completed tasks cannot be pending');
        }

        let createdUser;

        await mongoose.connection.transaction(async (session) => {
            // Create the new user
            const user = new User({
                name,
                email,
                pendingTasks
            });

            await user.save({ session });

            const userId = user._id.toString();

            // Remove transferred tasks from previous users
            for (const task of tasks) {
                if (task.assignedUser) {
                    await User.updateOne(
                        { _id: task.assignedUser },
                        {
                            $pull: {
                                pendingTasks: task._id.toString()
                            }
                        },
                        { session }
                    );
                }
            }

            // Assign requested tasks to the new user
            await Task.updateMany(
                { _id: { $in: pendingTasks } },
                {
                    $set: {
                        assignedUser: userId,
                        assignedUserName: name
                    }
                },
                { session }
            );

            createdUser = user;
        });

        return res.status(201).json({
            message: 'User created successfully',
            data: createdUser
        });

    } catch (error) {
        return handleError(res, error);
    }
});



router.get('/:id', async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 404, 'User not found');
        }

        let query = User.findById(req.params.id);

        if (req.query.select !== undefined) {
            let projection;

            try {
                projection = JSON.parse(req.query.select);

                if (
                    !projection ||
                    typeof projection !== 'object' ||
                    Array.isArray(projection) ||
                    !Object.values(projection).every(
                        value => value === 0 || value === 1
                    )
                ) {
                    return sendError(res, 400, 'Invalid select parameter');
                }
            } catch {
                return sendError(res, 400, 'Invalid select parameter');
            }

            query = query.select(projection);
        }

        const user = await query;

        if (!user) {
            return sendError(res, 404, 'User not found');
        }

        return res.status(200).json({
            message: 'OK',
            data: user
        });
    } catch (error) {
        return handleError(res, error);
    }
});



router.put('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // URL resource must exist before body validation
        if (!isValidId(id)) {
            return sendError(res, 404, 'User not found');
        }

        const existing = await User.findById(id);
        if (!existing) {
            return sendError(res, 404, 'User not found');
        }

        const body = req.body;

        if (!body || typeof body !== 'object' ||
            Array.isArray(body)) {
            return sendError(res, 400, 'Invalid request body');
        }

        const { name, email, pendingTasks = [] } = body;

        if (!isNonEmptyString(name) ||
            !isNonEmptyString(email)) {
            return sendError(res, 400,
                'Valid name and email are required');
        }

        if (!Array.isArray(pendingTasks) ||
            !pendingTasks.every(isValidId)) {
            return sendError(res, 400,
                'Invalid pendingTasks IDs');
        }

        if (new Set(pendingTasks).size !== pendingTasks.length) {
            return sendError(res, 400,
                'Duplicate task IDs are not allowed');
        }

        const duplicate = await User.findOne({
            email,
            _id: { $ne: existing._id }
        });

        if (duplicate) {
            return sendError(res, 400,
                'A user with this email already exists');
        }

        const tasks = await Task.find({
            _id: { $in: pendingTasks }
        });

        if (tasks.length !== pendingTasks.length) {
            return sendError(res, 404,
                'One or more tasks do not exist');
        }

        if (tasks.some(task => task.completed)) {
            return sendError(res, 400,
                'Completed tasks cannot be pending');
        }

        const userId = existing._id.toString();
        const requested = new Set(pendingTasks);

        await mongoose.connection.transaction(async (session) => {
            // Remove tasks omitted from the new pending list
            await Task.updateMany(
                {
                    assignedUser: userId,
                    completed: false,
                    _id: { $nin: pendingTasks }
                },
                {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                },
                { session }
            );

            // Transfer requested pending tasks from other users
            for (const task of tasks) {
                if (task.assignedUser &&
                    task.assignedUser !== userId) {
                    await User.updateOne(
                        { _id: task.assignedUser },
                        { $pull: {
                            pendingTasks: task._id.toString()
                        }},
                        { session }
                    );
                }
            }

            // Assign all requested pending tasks
            await Task.updateMany(
                { _id: { $in: pendingTasks } },
                {
                    $set: {
                        assignedUser: userId,
                        assignedUserName: name
                    }
                },
                { session }
            );

            // Rename all other tasks already assigned to this user,
            // including completed tasks
            await Task.updateMany(
                { assignedUser: userId },
                { $set: { assignedUserName: name } },
                { session }
            );

            existing.name = name;
            existing.email = email;
            existing.pendingTasks = pendingTasks;

            await existing.save({ session });
        });

        return res.status(200).json({
            message: 'User updated successfully',
            data: existing
        });

    } catch (error) {
        return handleError(res, error);
    }
});




router.delete('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        if (!isValidId(id)) {
            return sendError(res, 404, 'User not found');
        }

        let deletedUser;

        await mongoose.connection.transaction(async (session) => {
            const user = await User.findById(id).session(session);

            if (!user) {
                return;
            }

            await Task.updateMany(
                { assignedUser: user._id.toString() },
                {
                    $set: {
                        assignedUser: '',
                        assignedUserName: 'unassigned'
                    }
                },
                { session }
            );

            await User.deleteOne({ _id: user._id }, { session });
            deletedUser = user;
        });

        if (!deletedUser) {
            return sendError(res, 404, 'User not found');
        }

        return res.status(204).send();
    } catch (error) {
        return handleError(res, error);
    }
});


module.exports = router;
