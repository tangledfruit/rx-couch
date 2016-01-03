'use strict';

const rxFetch = require('rx-fetch');
const url = require('url');

//------------------------------------------------------------------------------

var server = module.exports = function (baseUrl) {

  if (!this) {
    throw new Error("rxCouch must be called as a constructor (i.e. `new rxCouch(baseUrl)``");
  }

  const parsedUrl = url.parse(baseUrl ? baseUrl : 'http://localhost:5984');
  const pathName = parsedUrl.pathname;
  if (pathName && pathName !== '/') {
    throw new Error("CouchDB server must not contain a path or query string");
  }

  this._baseUrl = url.format(parsedUrl);

};

//------------------------------------------------------------------------------

const validateNameAndMakeUrl = function (serverUrl, dbName, apiName) {

  // Since this is an internal function, we can assume serverUrl has been
  // previously validated.

  if (typeof (dbName) != 'string')
    throw new Error("rxCouch." + apiName + ": dbName must be a string");

  if (!dbName.match(/^[a-z][a-z0-9_$()+/-]*$/))
    throw new Error("rxCouch." + apiName + ": illegal dbName");

  return url.resolve(serverUrl, dbName);

};

//------------------------------------------------------------------------------
/**
 * Return an Observable which will fire once with a list of all databases
 * available on the server.
 */

server.prototype.allDatabases = function () {

  return rxFetch(url.resolve(this._baseUrl, '_all_dbs')).json();

};

//------------------------------------------------------------------------------
/**
 * Create a new database on the server. Return an Observable which sends only
 * an onCompleted event when the database has been created.
 */

server.prototype.createDatabase = function (dbName) {

  return rxFetch(validateNameAndMakeUrl(this._baseUrl, dbName, 'createDatabase'), { method: 'put' })
    .failIfStatusNotIn([201, 412])
    .filter(() => false);

};

//------------------------------------------------------------------------------
/**
 * Create a new database on the server. Return an Observable which sends only
 * an onCompleted event when the database has been created.
 */

server.prototype.deleteDatabase = function (dbName) {

  return rxFetch(validateNameAndMakeUrl(this._baseUrl, dbName, 'deleteDatabase'), { method: 'delete' })
    .failIfStatusNotIn([200, 404])
    .filter(() => false);

};
