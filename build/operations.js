
/*
Copyright 2016 Resin.io

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 */

/**
 * @module operations
 */
var EventEmitter, Promise, _, action, utils;

EventEmitter = require('events').EventEmitter;

Promise = require('bluebird');

_ = require('lodash');

_.str = require('underscore.string');

utils = require('./utils');

action = require('./action');


/**
 * @summary Execute a set of operations over an image
 * @function
 * @public
 *
 * @description
 * This function returns an `EventEmitter` object that emits the following events:
 *
 * - `state (Object state)`: When an operation is going to be executed. The state object contains the `operation` and the progress `percentage` (0-100).
 * - `stdout (String data)`: When an operation prints to stdout.
 * - `stderr (String data)`: When an operation prints to stderr.
 * - `error (Error error)`: When an error happens.
 * - `end`: When all the operations are completed successfully.
 *
 * @param {String} image - path to image
 * @param {Object[]} operations - array of operations
 * @param {Object} options - configuration options
 *
 * @returns {EventEmitter}
 *
 * @example
 * execution = operations.execute 'foo/bar.img', [
 * 	command: 'copy'
 * 	from:
 * 		partition:
 * 			primary: 1
 * 		path: '/bitstreams/parallella_e16_headless_gpiose_7010.bit.bin'
 * 	to:
 * 		partition:
 * 			primary: 1
 * 		path: '/parallella.bit.bin'
 * 	when:
 * 		coprocessorCore: '16'
 * 		processorType: 'Z7010'
 * ,
 * 	command: 'copy'
 * 	from:
 * 		partition:
 * 			primary: 1
 * 		path: '/bistreams/parallella_e16_headless_gpiose_7020.bit.bin'
 * 	to:
 * 		partition:
 * 			primary: 1
 * 		path: '/parallella.bit.bin'
 * 	when:
 * 		coprocessorCore: '16'
 * 		processorType: 'Z7020'
 * ],
 * 	coprocessorCore: '16'
 * 	processorType: 'Z7010'
 *
 * execution.on('stdout', process.stdout.write)
 * execution.on('stderr', process.stderr.write)
 *
 * execution.on 'state', (state) ->
 * 	console.log(state.operation.command)
 * 	console.log(state.percentage)
 *
 * execution.on 'error', (error) ->
 * 	throw error
 *
 * execution.on 'end', ->
 * 	console.log('Finished all operations')
 */

exports.execute = function(image, operations, options) {
  var emitter, missingOptions;
  if (options == null) {
    options = {};
  }
  if (options.os == null) {
    options.os = utils.getOperatingSystem();
  }
  missingOptions = utils.getMissingOptions(operations, options);
  if (!_.isEmpty(missingOptions)) {
    throw new Error("Missing options: " + (_.str.toSentence(missingOptions)));
  }
  emitter = new EventEmitter();
  Promise["try"](function() {
    var emitterOn, promises;
    operations = utils.filterWhenMatches(operations, options);
    promises = _.map(operations, function(operation) {
      return action.run(image, operation, options);
    });
    emitterOn = emitter.on;
    emitter.on = function(event, callback) {
      if (event === 'end' && emitter.ended) {
        return callback();
      }
      return emitterOn.apply(emitter, arguments);
    };
    return Promise.delay(1).then(function() {
      return Promise.each(promises, function(promise, index) {
        var state;
        state = {
          operation: operations[index],
          percentage: action.getOperationProgress(index, operations)
        };
        emitter.emit('state', state);
        return promise().then(function(actionEvent) {
          var ref, ref1;
          if ((ref = actionEvent.stdout) != null) {
            ref.on('data', function(data) {
              return emitter.emit('stdout', data);
            });
          }
          if ((ref1 = actionEvent.stderr) != null) {
            ref1.on('data', function(data) {
              return emitter.emit('stderr', data);
            });
          }
          actionEvent.on('progress', function(state) {
            return emitter.emit('burn', state);
          });
          return utils.waitStreamToClose(actionEvent);
        });
      });
    });
  }).then(function() {
    emitter.emit('end');
    return emitter.ended = true;
  })["catch"](function(error) {
    return emitter.emit('error', error);
  });
  return emitter;
};
