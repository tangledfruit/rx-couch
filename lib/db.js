'use strict';

let Rx;
/* istanbul ignore next */
try {
  Rx = require('rx');
}
catch (err) {

  /*
    Why not add Rx as a dependency of this project? With npm 2.x, subproject
    dependencies get installed as a separate copy. It then becomes a race condition
    as to which copy gets patched by rx-to-async-iterator. Better to use the
    peerDependency mechanism so you can have only one copy of RxJS in your
    overall project.
  */

  console.log("ERROR: require 'rx' failed.");
  console.log("Make sure your project lists rx>=4.0.7 <5 as a dependency.\n\n");
  process.exit(1);

}

const rxFetch = require('rx-fetch');
const deepEqual = require('deep-eql');
const deepMerge = require('deepmerge');
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
 * Update an existing document or create a new document with this content.
 * Pass in a single Object which will be the new content to be applied
 * to this document. It must contain an _id field, specifying the document ID
 * to update or create. It must *NOT* contain a _rev field, as the revision ID
 * will be automatically populated from the existing document (if any).
 *
 * Conceptually, this function does get -> merge content -> put atomically, although
 * it is possible that the operation will fail if a competing update happens
 * in the interim.
 *
 * Returns an Observable which will fire exactly once on success. The result will
 * contain the CouchDB response object decoded from JSON
 * (i.e. {id: "document ID", ok: true, rev: "new revision ID"}.
 */

db.prototype.update = function (value) {

  if (!value) {
    throw new Error("rxCouch.db.update: missing document value");
  }

  if (typeof (value) !== 'object') {
    throw new Error("rxCouch.db.update: invalid document value");
  }

  const id = value._id;
  if (!id) {
    throw new Error("rxCouch.db.update: _id is missing");
  }

  if (value._rev) {
    throw new Error("rxCouch.db.update: _rev is not allowed");
  }

  return this.get(id)
    .catch(err => {

      // If no such document, create an empty placeholder document.
      // Otherwise, just rethrow the error.

      /* istanbul ignore else */
      if (err.message.match(/HTTP Error 404/)) {
        return Rx.Observable.just({_id: id});
      } else {
        return Rx.Observable.throw(err);
      }

    })
    .flatMapLatest(oldValue => {

      // Apply new content as a delta against existing doc value,
      // but only if there is an actual change.

      const newValue = deepMerge(oldValue, value);

      if (deepEqual(oldValue, newValue)) {
        return Rx.Observable.just({
          id: id,
          ok: true,
          rev: oldValue._rev,
          noop: true
        });
      } else {
        return this.put(deepMerge(oldValue, value));
      }

    });

};


/**
 * Replace an existing document value or create a new document with this content.
 * Pass in a single Object which will be the new content to be used as this
 * document's new value. It must contain an _id field, specifying the document ID
 * to update or create. It must *NOT* contain a _rev field, as the revision ID
 * will be automatically populated from the existing document (if any).
 *
 * If the document's value is exactly the same as the existing content, do not
 * update. (A typical use case: If writes to your database are priced expensively
 * and you want to avoid them.)
 *
 * Conceptually, this function does get -> replace content -> put atomically,
 * although it is possible that the operation will fail if a competing update happens
 * in the interim.
 *
 * Returns an Observable which will fire exactly once on success. The result will
 * contain the CouchDB response object decoded from JSON
 * (i.e. {id: "document ID", ok: true, rev: "new revision ID"}.
 */

db.prototype.replace = function (value) {

  if (!value) {
    throw new Error("rxCouch.db.replace: missing document value");
  }

  if (typeof (value) !== 'object') {
    throw new Error("rxCouch.db.replace: invalid document value");
  }

  const id = value._id;
  if (!id) {
    throw new Error("rxCouch.db.replace: _id is missing");
  }

  if (value._rev) {
    throw new Error("rxCouch.db.replace: _rev is not allowed");
  }

  return this.get(id)
    .catch(err => {

      // If no such document, create an empty placeholder document.
      // Otherwise, just rethrow the error.

      /* istanbul ignore else */
      if (err.message.match(/HTTP Error 404/)) {
        return Rx.Observable.just({_id: id});
      } else {
        return Rx.Observable.throw(err);
      }

    })
    .flatMapLatest(oldValue => {

      // Apply new content as a delta against existing doc value,
      // but only if there is an actual change.

      const newValue = deepMerge(value, {_rev: oldValue._rev});

      if (deepEqual(oldValue, newValue)) {
        return Rx.Observable.just({
          id: id,
          ok: true,
          rev: oldValue._rev,
          noop: true
        });
      } else {
        return this.put(newValue);
      }

    });

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


/**
 * Retrieve all documents, or a specific subset of documents.
 *
 * If an options object is provided, it is converted to query options.
 *
 * Returns an Observable which will fire once on success. The result will
 * contain the CouchDB response object decoded from JSON.
 *
 * See http://docs.couchdb.org/en/latest/api/database/bulk-api.html#get--db-_all_docs
 * for valid request options and response objects.
 */

db.prototype.allDocs = function (options) {

  // Ugh. CouchDB croaks on unquoted strings for some option values.

  let fixedOptions = options;
  if (typeof (options) === 'object') {
    fixedOptions = {};
    Object.keys(options).forEach(key => {
      let value = options[key];
      if (typeof(value) == 'string' && !value.match(/^".*"$/)) {
        value = "\"" + value + "\"";
      }
      fixedOptions[key] = value;
    });
  }

  const getUrl = this._dbUrl + "/_all_docs" +
    (fixedOptions ? ("?" + querystring.stringify(fixedOptions)) : "");

  return rxFetch(getUrl, {headers:{Accept: 'application/json'}}).json();

};
