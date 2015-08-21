let program = require('commander'),
    packageJson = require('../package.json'),
    updates = require('./update'),
    util = require('./util');

let config = util.getConfig();

require('./commands')(program, config);

module.exports = function() {
    program
        .version(packageJson.version)
        .usage('<command> [options]')
        .parse(process.argv);

    // Run help if no command is provided
    if (!process.argv.slice(2).length) {
        util.printLogo();
        program.outputHelp();
    }

    // Run/Display update notifications
    updates.check();
    updates.notify();
};
