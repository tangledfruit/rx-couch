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
