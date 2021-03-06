'use strict'
var path = require('path')
var validate = require('aproba')
var chain = require('slide').chain
var asyncMap = require('slide').asyncMap
var uniqueFilename = require('unique-filename')
var log = require('npmlog')
var andFinishTracker = require('./and-finish-tracker.js')
var andAddParentToErrors = require('./and-add-parent-to-errors.js')
var failedDependency = require('./deps.js').failedDependency

var actions = {}

actions.fetch = require('./action/fetch.js')
actions.extract = require('./action/extract.js')
actions.build = require('./action/build.js')
actions.test = require('./action/test.js')
actions.preinstall = require('./action/preinstall.js')
actions.install = require('./action/install.js')
actions.postinstall = require('./action/postinstall.js')
actions.prepublish = require('./action/prepublish.js')
actions.finalize = require('./action/finalize.js')
actions.remove = require('./action/remove.js')
actions.move = require('./action/move.js')
actions['update-linked'] = require('./action/update-linked.js')
actions['global-install'] = require('./action/global-install.js')
actions['global-link'] = require('./action/global-link.js')

// FIXME: We wrap actions like three ways to sunday here.
// Rewrite this to only work one way.

Object.keys(actions).forEach(function (actionName) {
  var action = actions[actionName]
  actions[actionName] = function (top, buildpath, pkg, log, next) {
    validate('SSOOF', arguments)
    // refuse to run actions for failed packages
    if (pkg.failed) return next()
    if (action.rollback) {
      if (!pkg.rollback) pkg.rollback = []
      pkg.rollback.unshift(action.rollback)
    }
    return action(top, buildpath, pkg, log, andFinishTracker(log, andAddParentToErrors(pkg.parent, andHandleOptionalDepErrors(pkg, next))))
  }
})

function andHandleOptionalDepErrors (pkg, next) {
  return function (er) {
    if (!er) return next.apply(null, arguments)
    pkg.failed = true
    var anyFatal = pkg.directlyRequested || !pkg.parent
    for (var ii = 0; ii < pkg.requiredBy.length; ++ii) {
      var parent = pkg.requiredBy[ii]
      var isFatal = failedDependency(parent, pkg)
      if (isFatal) anyFatal = true
    }
    if (anyFatal) return next.apply(null, arguments)
    log.warn('install:' + pkg.package.name, "Couldn't install optional dependency:", er.message)
    log.verbose('install:' + pkg.package.name, er.stack)
    next()
  }
}

function prepareAction (staging, log) {
  validate('SO', arguments)
  return function (action) {
    validate('SO', action)
    var cmd = action[0]
    var pkg = action[1]
    if (!actions[cmd]) throw new Error('Unknown decomposed command "' + cmd + '" (is it new?)')
    var buildpath = uniqueFilename(staging, pkg.package.name, pkg.realpath)
    var top = path.resolve(staging, '../..')
    return [actions[cmd], top, buildpath, pkg, log.newGroup(cmd + ':' + pkg.package.name)]
  }
}

exports.actions = actions

function execAction (todo, done) {
  validate('AF', arguments)
  var cmd = todo.shift()
  todo.push(done)
  cmd.apply(null, todo)
}

exports.doOne = function (cmd, staging, pkg, log, next) {
  validate('SSOOF', arguments)
  execAction(prepareAction(staging, log)([cmd, pkg]), next)
}

exports.doSerial = function (type, staging, actionsToRun, log, next) {
  validate('SSAOF', arguments)
  actionsToRun = actionsToRun
    .filter(function (value) { return value[0] === type })
  log.silly('doSerial', '%s %d', type, actionsToRun.length)
  chain(actionsToRun.map(prepareAction(staging, log)), andFinishTracker(log, next))
}

exports.doParallel = function (type, staging, actionsToRun, log, next) {
  validate('SSAOF', arguments)
  actionsToRun = actionsToRun.filter(function (value) { return value[0] === type })
  log.silly('doParallel', type + ' ' + actionsToRun.length)

  asyncMap(actionsToRun.map(prepareAction(staging, log)), execAction, andFinishTracker(log, next))
}
