let _ = require('lodash'),
    local = require('../local').start;

module.exports = function sicksyncStartCommand(program, config) {
    program
        .command('start [projects...]')
        .description('Starts the continuous sicksync process for the given project(s)')
        .action(_.partial(_.ary(local, 2), config));
};
