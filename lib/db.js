'use strict';

const rxFetch = require('rx-fetch');
const url = require('url');

//------------------------------------------------------------------------------

var db = module.exports = function (dbUrl) {

  // Since this function is only accessible internally, we assume that dbUrl
  // has been validated already.

  this._dbUrl = dbUrl;

};

//------------------------------------------------------------------------------
/**
 * Create a new document or update an existing document. Pass in a single Object
 * which will be the new document value. It should normally contain _id and _rev
 * fields, specifying the document ID and existing revision ID to replace. Omit
 * _rev when creating a new document. Omit _id when creating a new document if
 * you want CouchDB to assign a document ID for you.
 *
 * Returns an Observable which will fire exactly once on success. The result will
 * contain the CouchDB response object decoded from JSON
 * (i.e. {id: "document ID", ok: true, rev: "new revision ID"}.
 *
 * See http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
 * and http://docs.couchdb.org/en/latest/api/database/common.html#post--db.
 */

db.prototype.put = function (value) {

  if (!value) {
    throw new Error("rxCouch.db.put: missing document value");
  }

  if (typeof (value) !== 'object') {
    throw new Error("rxCouch.db.put: invalid document value");
  }

  const docId = value._id;
  const requestMethod = docId ? 'put' : 'post';
  const postUrl = docId ? this._dbUrl + "/" + docId : this._dbUrl;

  var options = {
    method: requestMethod,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (value._rev) {
    options.headers['If-Match'] = value._rev;
    delete value._rev;
  }

  delete value._id;

  options.body = JSON.stringify(value);

  return rxFetch(postUrl, options).json();

};
