'use strict';

const rxFetch = require('rx-fetch');
const shallowCopy = require('shallow-copy');
const querystring = require('querystring');
const url = require('url');


let db = module.exports = function (dbUrl) {

  // Since this function is only accessible internally, we assume that dbUrl
  // has been validated already.

  this._dbUrl = dbUrl;

};


const makeDocUrl = (dbUrl, docId, queryOptions) =>
  dbUrl + "/" + docId + (queryOptions ? ("?" + querystring.stringify(queryOptions)) : "");


/**
 * Retrieve the value of an existing document.
 *
 * If an options object is provided, it is converted to query options.
 *
 * Returns an Observable which will fire exactly once on success. The result will
 * contain the CouchDB response object decoded from JSON.
 *
 * See http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
 * for valid request options and response objects.
 */

db.prototype.get = function (id, options) {

  if (!id) {
    throw new Error("rxCouch.db.get: missing document ID");
  }

  if (typeof (id) !== 'string' || id.length === 0) {
    throw new Error("rxCouch.db.get: invalid document ID");
  }

  const getUrl = makeDocUrl(this._dbUrl, id, options);

  return rxFetch(getUrl, {headers:{Accept: 'application/json'}}).json();

};


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

  let valueCopy = shallowCopy(value);

  const docId = valueCopy._id;
  const requestMethod = docId ? 'put' : 'post';
  const postUrl = docId ? makeDocUrl(this._dbUrl, docId) : this._dbUrl;

  let options = {
    method: requestMethod,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    }
  };

  if (valueCopy._rev) {
    options.headers['If-Match'] = valueCopy._rev;
    delete valueCopy._rev;
  }

  delete valueCopy._id;

  options.body = JSON.stringify(valueCopy);

  return rxFetch(postUrl, options).json();

};


/**
 * Delete an existing document. You must pass a valid, existing document ID
 * and the current revision ID for that document.
 *
 * Returns an Observable which will fire exactly once on success. The result will
 * contain the CouchDB response object decoded from JSON.
 *
 * See http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
 * for valid request options and response objects.
 */

db.prototype.delete = function (id, rev) {

  if (!id) {
    throw new Error("rxCouch.db.delete: missing document ID");
  }

  if (typeof (id) !== 'string' || id.length === 0) {
    throw new Error("rxCouch.db.delete: invalid document ID");
  }

  if (!rev) {
    throw new Error("rxCouch.db.delete: missing revision ID");
  }

  if (typeof (rev) !== 'string' || rev.length === 0) {
    throw new Error("rxCouch.db.delete: invalid revision ID");
  }

  const deleteUrl = makeDocUrl(this._dbUrl, id);

  const requestOptions = {
    method: 'delete',
    headers: {
      Accept: 'application/json',
      'If-Match': rev
    }
  };

  return rxFetch(deleteUrl, requestOptions).json();

};
