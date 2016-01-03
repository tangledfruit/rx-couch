'use strict';

const rxFetch = require('rx-fetch');
const url = require('url');

//------------------------------------------------------------------------------

var server = module.exports = function (baseUrl) {

  const parsedUrl = url.parse(baseUrl ? baseUrl : 'http://localhost:5984');
  const pathName = parsedUrl.pathname;
  if (pathName && pathName !== '/') {
    throw new Error("CouchDB server must not contain a path or query string");
  }

  this._baseUrl = url.format(parsedUrl);

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

  if (typeof (dbName) != 'string' || dbName.length === 0) {
    throw new Error("rxCouch.createDatabase: dbName must be non-empty string");
  }

  return rxFetch(url.resolve(this._baseUrl, dbName), { method: 'put' })
    .map((response) => {
      if ([201, 412].indexOf(response.status) === -1) {
        throw new Error("Unexpected response from server " +
                        response.status + " " + response.statusText);
      }
      return response;
    })
    .filter(() => false);

};

//------------------------------------------------------------------------------
/**
 * Create a new database on the server. Return an Observable which sends only
 * an onCompleted event when the database has been created.
 */

server.prototype.deleteDatabase = function (dbName) {

  if (typeof (dbName) != 'string' || dbName.length === 0) {
    throw new Error("rxCouch.deleteDatabase: dbName must be non-empty string");
  }

  return rxFetch(url.resolve(this._baseUrl, dbName), { method: 'delete' })
    .map((response) => {
      if ([200, 404].indexOf(response.status) === -1) {
        throw new Error("Unexpected response from server " +
                        response.status + " " + response.statusText);
      }
      return response;
    })
    .filter(() => false);

};
