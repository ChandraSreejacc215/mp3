
function parseObject(value, parameter, allowedValues) {
    if (value === undefined) return {};

    let parsed;

    try {
        parsed = JSON.parse(value);
    } catch {
        throw new Error(`Invalid ${parameter} parameter`);
    }

    if (!parsed || typeof parsed !== 'object' ||
        Array.isArray(parsed)) {
        throw new Error(`Invalid ${parameter} parameter`);
    }

    if (allowedValues &&
        !Object.values(parsed).every(v => allowedValues.includes(v))) {
        throw new Error(`Invalid ${parameter} parameter`);
    }

    return parsed;
}

function parseNumber(value, parameter) {
    if (value === undefined) return undefined;

    const number = Number(value);

    if (!Number.isSafeInteger(number) || number < 0 ||
        String(value).trim() === '') {
        throw new Error(`Invalid ${parameter} parameter`);
    }

    return number;
}

async function getCollection(Model, params, defaultLimit) {
    const where = parseObject(params.where, 'where');
    const sort = parseObject(params.sort, 'sort', [1, -1]);
    const select = parseObject(params.select, 'select', [0, 1]);

    const skip = parseNumber(params.skip, 'skip');
    const limit = parseNumber(params.limit, 'limit');

    let count = false;

    if (params.count !== undefined) {
        try {
            count = JSON.parse(params.count);
        } catch {
            throw new Error('Invalid count parameter');
        }

        if (typeof count !== 'boolean') {
            throw new Error('Invalid count parameter');
        }
    }

    if (count) {
        return Model.countDocuments(where);
    }

    let query = Model.find(where).sort(sort).select(select);

    if (skip !== undefined) {
        query = query.skip(skip);
    }

    if (limit !== undefined) {
        query = query.limit(limit);
    } else if (defaultLimit !== null) {
        query = query.limit(defaultLimit);
    }

    return query.exec();
}

module.exports = { getCollection };
