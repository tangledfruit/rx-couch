'use strict';

const rxFetch = require('rx-fetch');
const url = require('url');

const Db = require('./db');

let server = module.exports = function (baseUrl) {
  if (!this) {
    throw new Error('rxCouch must be called as a constructor (i.e. `new rxCouch(baseUrl)`');
  }

  if (!baseUrl) baseUrl = 'http://localhost:5984';
  const parsedUrl = url.parse(baseUrl);
  const pathName = parsedUrl.pathname;
  if (pathName && pathName !== '/') {
    throw new Error('CouchDB server must not contain a path or query string');
  }

  this._baseUrl = url.format(parsedUrl);
};

const validateNameAndMakeUrl = (serverUrl, dbName, apiName) => {
  // Since this is an internal function, we can assume serverUrl has been
  // previously validated.

  if (typeof (dbName) !== 'string') {
    throw new Error('rxCouch.' + apiName + ': dbName must be a string');
  }

  if (!dbName.match(/^[a-z][a-z0-9_$()+/-]*$/)) {
    throw new Error('rxCouch.' + apiName + ': illegal dbName');
  }

  return url.resolve(serverUrl, dbName);
};

/**
 * Return an Observable which will fire once with a list of all databases
 * available on the server.
 */

server.prototype.allDatabases = function () {
  return rxFetch(url.resolve(this._baseUrl, '_all_dbs')).json();
};

/**
 * Create a new database on the server. Return an Observable which sends only
 * an onCompleted event when the database has been created.
 *
 * @param dbName (String) name of database to create
 * @param options (optional, Object) options
 *    - failIfExists: (optional, Boolean): if true, will fail with 412 error if
 *         database already exists
 */

server.prototype.createDatabase = function (dbName, options) {
  if (options && typeof (options) !== 'object') {
    throw new Error('rxCouch.createDatabase: options, if present, must be an object');
  }

  const failIfExists = options && options.failIfExists;
  if (failIfExists && typeof (failIfExists) !== 'boolean') {
    throw new Error('rxCouch.createDatabase: options.failIfExists, if present, must be a boolean');
  }

  const expectedStatusValues = failIfExists ? [201] : [201, 412];
    // We presume 412 means "database already exists" and quietly consume that
    // by default.

  return rxFetch(validateNameAndMakeUrl(this._baseUrl, dbName, 'createDatabase'), { method: 'put' })
    .failIfStatusNotIn(expectedStatusValues)
    .filter(() => false);
};

/**
 * Create a new database on the server. Return an Observable which sends only
 * an onCompleted event when the database has been created.
 */

server.prototype.deleteDatabase = function (dbName) {
  return rxFetch(validateNameAndMakeUrl(this._baseUrl, dbName, 'deleteDatabase'), { method: 'delete' })
    .failIfStatusNotIn([200, 404])
    .filter(() => false);
};

/**
 * Create or cancel a replication. Return an Observable which sends back the
 * parsed JSON status returned by CouchDB.
 *
 * See http://docs.couchdb.org/en/latest/api/server/common.html#replicate for
 * request and response options.
 *
 * @param options request options
 *
 * @return Observable< Object > returns response object when available
 */

server.prototype.replicate = function (options) {
  if (typeof (options) !== 'object') {
    throw new Error('rxCouch.replicate: options must be an object');
  }

  let requestOptions = {
    method: 'post',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  };

  requestOptions.body = JSON.stringify(options);

  return rxFetch(url.resolve(this._baseUrl, '_replicate'), requestOptions).json();
};

/**
 * Create an object that can be used to access an individual database.
 * Does not actually create the database on the server.
 */

server.prototype.db = function (dbName) {
  return new Db(validateNameAndMakeUrl(this._baseUrl, dbName, 'db'));
};
