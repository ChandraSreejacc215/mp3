
const express = require('express');
const router = express.Router();
const Task = require('../models/task');
const { getCollection } = require('../utils/query');

router.get('/', async (req, res) => {
    try {
        const tasks = await getCollection(Task, req.query, 100);

        return res.status(200).json({
            message: 'OK',
            data: tasks
        });
    } catch (error) {
        if (error.message.startsWith('Invalid ')) {
            return sendError(res, 400, error.message);
        }
        return handleError(res, error);
    }
});



const mongoose = require('mongoose');
const User = require('../models/user');

const {
    isNonEmptyString,
    isValidId,
    isValidDate,
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

        const {
            name,
            description = '',
            deadline,
            completed = false,
            assignedUser = '',
            assignedUserName
        } = body;

        // Validate required fields and field types
        if (!isNonEmptyString(name) ||
            !isValidDate(deadline)) {
            return sendError(res, 400,
                'Valid name and deadline are required');
        }

        if (typeof description !== 'string' ||
            typeof completed !== 'boolean' ||
            typeof assignedUser !== 'string') {
            return sendError(res, 400, 'Invalid task field types');
        }

        if (assignedUser !== '' && !isValidId(assignedUser)) {
            return sendError(res, 400, 'Invalid assigned user ID');
        }

        if (assignedUserName !== undefined &&
            typeof assignedUserName !== 'string') {
            return sendError(res, 400, 'Invalid assigned user name');
        }

        // Validate the referenced user before making changes
        let user = null;

        if (assignedUser !== '') {
            user = await User.findById(assignedUser);

            if (!user) {
                return sendError(res, 404,
                    'Assigned user does not exist');
            }

            if (assignedUserName !== undefined &&
                assignedUserName !== user.name) {
                return sendError(res, 400,
                    'Assigned user name does not match');
            }
        } else if (assignedUserName !== undefined &&
                   assignedUserName !== 'unassigned') {
            return sendError(res, 400,
                'Unassigned tasks must use the name unassigned');
        }

        const task = new Task({
            name,
            description,
            deadline,
            completed,
            assignedUser,
            assignedUserName: user ? user.name : 'unassigned'
        });

        // Save task and update user atomically
        await mongoose.connection.transaction(async (session) => {
            await task.save({ session });

            if (user && !completed) {
                await User.updateOne(
                    { _id: user._id },
                    { $addToSet: { pendingTasks: task._id.toString() } },
                    { session }
                );
            }
        });

        return res.status(201).json({
            message: 'Task created successfully',
            data: task
        });

    } catch (error) {
        return handleError(res, error);
    }
});


router.get('/:id', async (req, res) => {
    try {
        if (!isValidId(req.params.id)) {
            return sendError(res, 404, 'Task not found');
        }

        let query = Task.findById(req.params.id);

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

        const task = await query;

        if (!task) {
            return sendError(res, 404, 'Task not found');
        }

        return res.status(200).json({
            message: 'OK',
            data: task
        });
    } catch (error) {
        return handleError(res, error);
    }
});



router.put('/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // URL ID takes priority over body validation
        if (!isValidId(id)) {
            return sendError(res, 404, 'Task not found');
        }

        const existing = await Task.findById(id);
        if (!existing) {
            return sendError(res, 404, 'Task not found');
        }

        const body = req.body;

        if (!body || typeof body !== 'object' ||
            Array.isArray(body)) {
            return sendError(res, 400, 'Invalid request body');
        }

        const {
            name,
            description = '',
            deadline,
            completed = false,
            assignedUser = '',
            assignedUserName
        } = body;

        if (!isNonEmptyString(name) || !isValidDate(deadline)) {
            return sendError(res, 400,
                'Valid name and deadline are required');
        }

        if (typeof description !== 'string' ||
            typeof completed !== 'boolean' ||
            typeof assignedUser !== 'string') {
            return sendError(res, 400, 'Invalid task field types');
        }

        if (assignedUser !== '' && !isValidId(assignedUser)) {
            return sendError(res, 400, 'Invalid assigned user ID');
        }

        if (assignedUserName !== undefined &&
            typeof assignedUserName !== 'string') {
            return sendError(res, 400, 'Invalid assigned user name');
        }

        let newUser = null;

        if (assignedUser !== '') {
            newUser = await User.findById(assignedUser);

            if (!newUser) {
                return sendError(res, 404,
                    'Assigned user does not exist');
            }

            if (assignedUserName !== undefined &&
                assignedUserName !== newUser.name) {
                return sendError(res, 400,
                    'Assigned user name does not match');
            }
        } else if (assignedUserName !== undefined &&
                   assignedUserName !== 'unassigned') {
            return sendError(res, 400,
                'Unassigned tasks must use the name unassigned');
        }

        const taskId = existing._id.toString();

        await mongoose.connection.transaction(async (session) => {
            // Remove stale pending references from previous owner
            if (existing.assignedUser) {
                await User.updateOne(
                    { _id: existing.assignedUser },
                    { $pull: { pendingTasks: taskId } },
                    { session }
                );
            }

            // Replace fields while preserving _id and dateCreated
            existing.name = name;
            existing.description = description;
            existing.deadline = deadline;
            existing.completed = completed;
            existing.assignedUser = assignedUser;
            existing.assignedUserName = newUser
                ? newUser.name
                : 'unassigned';

            await existing.save({ session });

            // Only incomplete assigned tasks are pending
            if (newUser && !completed) {
                await User.updateOne(
                    { _id: newUser._id },
                    { $addToSet: { pendingTasks: taskId } },
                    { session }
                );
            }
        });

        return res.status(200).json({
            message: 'Task updated successfully',
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
            return sendError(res, 404, 'Task not found');
        }

        let deletedTask;

        await mongoose.connection.transaction(async (session) => {
            const task = await Task.findById(id).session(session);

            if (!task) {
                return;
            }

            if (task.assignedUser) {
                await User.updateOne(
                    { _id: task.assignedUser },
                    { $pull: { pendingTasks: task._id.toString() } },
                    { session }
                );
            }

            await Task.deleteOne({ _id: task._id }, { session });
            deletedTask = task;
        });

        if (!deletedTask) {
            return sendError(res, 404, 'Task not found');
        }

        return res.status(200).json({
            message: 'Task deleted successfully',
            data: deletedTask
        });
    } catch (error) {
        return handleError(res, error);
    }
});



module.exports = router;
