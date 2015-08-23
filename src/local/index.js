/**
 *  Client
 *
 *  Entry point into the client portion of sicksync
 */
let _ = require('lodash'),
    hostname = require('os').hostname(),
    constants = require('../../conf/constants'),
    text = require('../../conf/text'),
    eventsConf = require('../../conf/events'),
    util = require('../util'),
    FSHelper = util.uniqInstance(constants.FS_TOKEN, require('./fs-helper')),
    WebSocketClient = util.uniqInstance(constants.WS_TOKEN, require('./ws-client')),
    bigSync = require('../big-sync'),
    wsEvents = eventsConf.WS.LOCAL,
    fsEvents = eventsConf.FS.LOCAL;

function triggerBigSync(project, params, cb) {
    bigSync({
        project: project.project,
        excludes: project.excludes,
        sourceLocation: util.ensureTrailingSlash(project.sourceLocation),
        destinationLocation: util.ensureTrailingSlash(project.destinationLocation),
        hostname: project.hostname,
        username: project.username
    }, params, cb);
}

function start(config, projects) {
    _.each(projects, (project) => {
        let projectConf = _.findWhere(config.projects, { project });

        if (_.isEmpty(projectConf)) {
            return console.log(text.PROJECT_NOT_FOUND, project);
        }

        startProject(config, projectConf);
    });
}

function startProject (config, projectConf) {
    let localLog = util.generateLog(projectConf.project, hostname);
    let remoteLog = util.generateLog(projectConf.project, projectConf.hostname);
    let sourceLocation = util.ensureTrailingSlash(projectConf.sourceLocation);
    let destinationLocation = util.ensureTrailingSlash(projectConf.destinationLocation);
    let secret = util.getId();

    let fsHelper = new FSHelper({
        sourceLocation: sourceLocation,
        excludes: projectConf.excludes,
        followSymlinks: projectConf.followSymlinks
    });

    let wsClient = new WebSocketClient({
        username: projectConf.username,
        hostname: projectConf.hostname,
        websocketPort: projectConf.websocketPort,
        secret: secret,
        prefersEncrypted: projectConf.prefersEncrypted,
        retryOnDisconnect: config.retryOnDisconnect
    });

    // WS events
    wsClient.on(wsEvents.READY, () => {
        triggerBigSync(projectConf, { debug: config.debug }, () => {
            fsHelper.watch();

            localLog(
                text.SYNC_ON_CONNECT,
                projectConf.hostname, (projectConf.prefersEncrypted) ? 'using' : 'not using',
                'encryption'
            );
        });
    });

    wsClient.on(wsEvents.RECONNECTING, _.partial(_.ary(localLog, 1), text.SYNC_ON_RECONNECT));

    wsClient.on(wsEvents.DISCONNECTED, () => {
        localLog(text.SYNC_ON_DISCONNECT);
        process.exit();
    });

    wsClient.on(wsEvents.REMOTE_ERROR, (err) => {
        localLog(text.SYNC_ON_REMOTE_LOST, err);
        process.exit();
    });

    wsClient.on(wsEvents.REMOTE_MESSAGE, (message) => {
        // Since WS can be shared amongst projects, filter out
        // any that are not in this project
        if (_.contains(message, destinationLocation)) {
            remoteLog(message);
        }
    });

    // FS events
    fsHelper.on(fsEvents.CHANGE, (fileChange) => {
        fileChange.destinationpath = destinationLocation + fileChange.relativepath;
        fileChange.subject = 'file';

        localLog('>', fileChange.changeType, fileChange.localpath);
        
        wsClient.send(fileChange);
    });

    fsHelper.on(fsEvents.LARGE, () => {
        localLog(text.SYNC_ON_LARGE_CHANGE);
        fsHelper.pauseWatch();

        triggerBigSync(projectConf, { debug: config.debug }, () => {
            localLog(text.SYNC_ON_LARGE_CHANGE_DONE);
            fsHelper.watch();
        });
    });
}

function once(config, projects, opts) {
    _.each(projects, (project) => {
        let projectConf = _.findWhere(config.projects, { project });

        if (_.isEmpty(projectConf)) {
            return console.log(text.PROJECT_NOT_FOUND, project);
        }

        let localLog = util.generateLog(projectConf.project, hostname);
        
        localLog(text.SYNC_ON_ONCE);

        triggerBigSync(projectConf, {
            dry: opts.dryRun,
            debug: config.debug
        }, _.partial(localLog, text.SYNC_ON_ONCE_DONE));
    });
}

export default { start, once };