'use strict';

const Rx = require('rx');
const rxFetch = require('rx-fetch');
const deepEqual = require('deep-eql');
const deepMerge = require('deepmerge');
const shallowCopy = require('shallow-copy');
const querystring = require('querystring');

let db = module.exports = function (dbUrl, server) {
  // Since this function is only accessible internally, we assume that dbUrl
  // has been validated already.

  this._dbUrl = dbUrl;
  this._server = server;
  this._changesFetchCount = 0;
};

const makeDocUrl = (dbUrl, docId, queryOptions) =>
  dbUrl + '/' + docId + (queryOptions ? ('?' + querystring.stringify(queryOptions)) : '');

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
    throw new Error('rxCouch.db.get: missing document ID');
  }

  if (typeof (id) !== 'string' || id.length === 0) {
    throw new Error('rxCouch.db.get: invalid document ID');
  }

  const getUrl = makeDocUrl(this._dbUrl, id, options);

  return rxFetch(getUrl, {headers: {Accept: 'application/json'}}).json();
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
    throw new Error('rxCouch.db.put: missing document value');
  }

  if (typeof (value) !== 'object') {
    throw new Error('rxCouch.db.put: invalid document value');
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
    throw new Error('rxCouch.db.update: missing document value');
  }

  if (typeof (value) !== 'object') {
    throw new Error('rxCouch.db.update: invalid document value');
  }

  const id = value._id;
  if (!id) {
    throw new Error('rxCouch.db.update: _id is missing');
  }

  if (value._rev) {
    throw new Error('rxCouch.db.update: _rev is not allowed');
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
    throw new Error('rxCouch.db.replace: missing document value');
  }

  if (typeof (value) !== 'object') {
    throw new Error('rxCouch.db.replace: invalid document value');
  }

  const id = value._id;
  if (!id) {
    throw new Error('rxCouch.db.replace: _id is missing');
  }

  if (value._rev) {
    throw new Error('rxCouch.db.replace: _rev is not allowed');
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
    throw new Error('rxCouch.db.delete: missing document ID');
  }

  if (typeof (id) !== 'string' || id.length === 0) {
    throw new Error('rxCouch.db.delete: invalid document ID');
  }

  if (!rev) {
    throw new Error('rxCouch.db.delete: missing revision ID');
  }

  if (typeof (rev) !== 'string' || rev.length === 0) {
    throw new Error('rxCouch.db.delete: invalid revision ID');
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
      if (typeof (value) === 'string' && !value.match(/^".*"$/)) {
        value = '"' + value + '"';
      }
      fixedOptions[key] = value;
    });
  }

  const getUrl = this._dbUrl + '/_all_docs' +
    (fixedOptions ? ('?' + querystring.stringify(fixedOptions)) : '');

  return rxFetch(getUrl, {headers: {Accept: 'application/json'}}).json();
};

/**
 * Create or cancel a replication using this database as target.
 * Return an Observable which sends back the parsed JSON status
 * returned by CouchDB.
 *
 * See http://docs.couchdb.org/en/latest/api/server/common.html#replicate for
 * request and response options. Note that the URL for this database ("target")
 * is populated automatically.
 *
 * @param options request options
 *
 * @return Observable< Object > returns response object when available
 */

db.prototype.replicateFrom = function (options) {
  if (typeof (options) !== 'object') {
    throw new Error('rxCouch.db.replicateFrom: options must be an object');
  }
  if (options.target) {
    throw new Error('rxCouch.db.replicateFrom: options.target must not be specified');
  }

  let updatedOptions = shallowCopy(options);
  updatedOptions.target = this._dbUrl;

  return this._server.replicate(updatedOptions);
};

/**
 * Monitor changes to the database.
 * Return an Observable with sends back the parsed JSON results
 * returned by CouchDB. The results are sent back one-by-one
 * (one for each document).
 *
 * If feed: "longpoll" appears in the options object, the changes
 * feed is monitored continuously until the subscription is dropped.
 * It is an error to use feed: "continuous".
 *
 * See http://docs.couchdb.org/en/latest/api/database/changes.html for
 * request and response options.
 *
 * @param options request options
 *
 * @return Observable< Object > returns response object when available
 */

db.prototype.changes = function (options) {
  if (options && typeof (options) !== 'object') {
    throw new Error('rxCouch.db.changes: options must be an object');
  }
  if (options && options.feed === 'continuous') {
    throw new Error('rxCouch.db.changes: feed: "continuous" not supported');
  }

  let fixedOptions = options;
  if (options) {
    fixedOptions = {};
    Object.keys(options).forEach(key => {
      let value = options[key];
      if (Array.isArray(value)) {
        value = '["' + value.join('","') + '"]';
      }
      fixedOptions[key] = value;
    });
  }

  const getChangesOnce = () => {
    const getUrl = this._dbUrl + '/_changes' +
      (fixedOptions ? ('?' + querystring.stringify(fixedOptions)) : '');

    this._changesFetchCount++;
      // NOTE: This is only intended for debugging use.

    return rxFetch(getUrl, {headers: {Accept: 'application/json'}})
      .json()
      .tap(response => {
        if (options && options.feed === 'longpoll') {
          fixedOptions = fixedOptions || {};
          fixedOptions.since = response.last_seq;
        }
      })
      .flatMap(response => Rx.Observable.from(response.results));
  };

  const getChangesContinuously = () => {
    return getChangesOnce().concat(Rx.Observable.defer(() => getChangesContinuously()));
  };

  if (options && options.feed === 'longpoll') {
    return getChangesContinuously();
  } else {
    return getChangesOnce();
  }
};

/**
 * Observe the value of an existing document over time.
 *
 * Returns an Observable which will fire once with the document's value
 * soon after the call. It will then monitor the document value and send
 * updates so long as the subscription remains active.
 *
 * Use this sparingly; having many of these open at once could lead to
 * unacceptable server load.
 *
 * @param id document ID
 *
 * @return Observable< Object > document value with updates as needed
 */

db.prototype.observe = function (id) {
  if (!id) {
    throw new Error('rxCouch.db.observe: missing document ID');
  }
  if (typeof (id) !== 'string' || id.length === 0) {
    throw new Error('rxCouch.db.observe: invalid document ID');
  }

  // Some Couch servers do not support the _doc_ids filter. If we determine
  // that this is such a server, then we stop trying. (We shouldn't expect the
  // server to change its capabilities while we're talking to it.)

  const self = this;

  const noDocIdsFilterFallback = function () {
    self._dbDoesNotSupportDocIdsFilter = true;
    if (!self._sharedChangesFeed) {
      self._sharedChangesFeed = self.changes({feed: 'longpoll', include_docs: true, since: 'now'})
        .map(update => update.doc)
        .finally(() => {
          self._sharedChangesFeed = undefined;
        })
        .publish().refCount();
    }
    return self._sharedChangesFeed;
  };

  let previousRev;

  return this.get(id)

    .catch(Rx.Observable.just({_id: id, _empty: true}))

    // We prefer the _doc_ids filter, when available, but if we know it isn't,
    // don't bother trying.

    .concat(this._dbDoesNotSupportDocIdsFilter
      ? noDocIdsFilterFallback()
      : (this.changes({doc_ids: [id], feed: 'longpoll', filter: '_doc_ids', include_docs: true})
          .map(update => update.doc)
          .catch(Rx.Observable.defer(noDocIdsFilterFallback))))

    .filter(doc => {
      if (doc._id !== id || (previousRev && previousRev === doc._rev)) {
        return false;
      } else {
        previousRev = doc._rev;
        return true;
      }
    });
};
