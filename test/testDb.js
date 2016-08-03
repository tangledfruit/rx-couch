'use strict';

require('co-mocha');
require('rx-to-async-iterator');

const Rx = require('rx');
const expect = require('chai').expect;
const RxCouch = require('../lib/server');
const nock = require('nock');
const shallowCopy = require('shallow-copy');

describe('rx-couch.db()', () => {
  const server = new RxCouch('http://127.0.0.1:5984');

  before('create test database', function * () {
    this.timeout(5000);

    const dbsAfterCreate = yield (Rx.Observable.concat(
      server.createDatabase('test-rx-couch-db'),
      server.allDatabases())).shouldGenerateOneValue();

    expect(dbsAfterCreate).to.be.an('array');
    expect(dbsAfterCreate).to.include('test-rx-couch-db');
  });

  after('remove test database', function * () {
    this.timeout(5000);

    const dbsAfterDelete = yield (Rx.Observable.concat(
      server.deleteDatabase('test-rx-couch-db'),
      server.allDatabases())).shouldGenerateOneValue();

    expect(dbsAfterDelete).to.be.an('array');
    expect(dbsAfterDelete).to.not.include('test-rx-couch-db');
  });

  it('should be defined', () => {
    expect(server).to.respondTo('db');
  });

  it('should throw if database name is missing', () => {
    expect(() => server.db()).to.throw('rxCouch.db: dbName must be a string');
  });

  it('should throw if database name is empty', () => {
    expect(() => server.db('')).to.throw('rxCouch.db: illegal dbName');
  });

  it('should throw if database name is illegal (capital letters)', () => {
    expect(() => server.db('noCapitalLetters')).to.throw('rxCouch.db: illegal dbName');
  });

  it('should throw if database name is illegal (leading underscore)', () => {
    expect(() => server.db('_users')).to.throw('rxCouch.db: illegal dbName');
  });

  const db = server.db('test-rx-couch-db');
    // Defined out of scope because we use it throughout this test suite.

  it('should return an object', () => {
    expect(db).to.be.an('object');
  });

  let randomDocId;
  let rev1, rev2;

  describe('.put()', () => {
    it('should be defined', () => {
      expect(db).to.respondTo('put');
    });

    it('should throw if no document value is provided', () => {
      expect(() => db.put()).to.throw('rxCouch.db.put: missing document value');
    });

    it('should throw if an invalid document value is provided', () => {
      expect(() => db.put(42)).to.throw('rxCouch.db.put: invalid document value');
    });

    it('should assign a document ID if no document ID is provided', function * () {
      // http://docs.couchdb.org/en/latest/api/database/common.html#post--db

      const putResponse = yield db.put({foo: 'bar'}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.be.a('string');
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.be.a('string');

      randomDocId = putResponse.id;
    });

    it('should create a new document using specific ID if provided', function * () {
      // http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid

      const putResponse = yield db.put({_id: 'testing123', foo: 'bar'}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal('testing123');
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.match(/^1-/);
      rev1 = putResponse.rev;
    });

    it('should not alter the object that was provided to it', function * () {
      // http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid

      let putObject = {_id: 'testing234', foo: 'bar'};
      const putResponse = yield db.put(putObject).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal('testing234');
      expect(putObject).to.deep.equal({_id: 'testing234', foo: 'bar'});
    });

    it('should update an existing document when _id and _rev are provided', function * () {
      const putResponse = yield db.put({_id: 'testing123', _rev: rev1, foo: 'baz'}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal('testing123');
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.be.match(/^2-/);
      rev2 = putResponse.rev;
    });

    it('should fail when _id matches an existing document but no _rev is provided', function * () {
      const err = yield db.put({_id: 'testing123', foo: 'bar'}).shouldThrow();
      expect(err.message).to.equal('HTTP Error 409 on http://127.0.0.1:5984/test-rx-couch-db/testing123: Conflict');
    });

    it('should fail when _id matches an existing document but incorrect _rev is provided', function * () {
      const err = yield db.put({_id: 'testing123', '_rev': 'bogus', foo: 'bar'}).shouldThrow();
      expect(err.message).to.equal('HTTP Error 400 on http://127.0.0.1:5984/test-rx-couch-db/testing123: Bad Request');
    });
  });

  describe('.get()', () => {
    // http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid

    it('should be defined', () => {
      expect(db).to.respondTo('get');
    });

    it('should throw if no document ID is provided', () => {
      expect(() => db.get()).to.throw('rxCouch.db.get: missing document ID');
    });

    it('should throw if an invalid document ID is provided', () => {
      expect(() => db.get(42)).to.throw('rxCouch.db.get: invalid document ID');
    });

    it("should retrieve a document's current value if no options are provided", function * () {
      const getResponse = yield db.get('testing123').shouldGenerateOneValue();
      expect(getResponse).to.be.an('object');
      expect(getResponse._id).to.equal('testing123');
      expect(getResponse._rev).to.match(/^2-/);
      expect(getResponse.foo).to.equal('baz');
    });

    it('should pass through options when provided', function * () {
      const getResponse = yield db.get('testing123', {rev: rev1}).shouldGenerateOneValue();
      expect(getResponse).to.be.an('object');
      expect(getResponse._id).to.equal('testing123');
      expect(getResponse._rev).to.match(/^1-/);
      expect(getResponse.foo).to.equal('bar');
    });

    it("should fail when _id doesn't match an existing document", function * () {
      const err = yield db.get('testing432').shouldThrow();
      expect(err.message).to.equal('HTTP Error 404 on http://127.0.0.1:5984/test-rx-couch-db/testing432: Object Not Found');
    });
  });

  describe('.update()', () => {
    it('should be defined', () => {
      expect(db).to.respondTo('update');
    });

    it('should throw if no document value is provided', () => {
      expect(() => db.update()).to.throw('rxCouch.db.update: missing document value');
    });

    it('should throw if an invalid document value is provided', () => {
      expect(() => db.update(42)).to.throw('rxCouch.db.update: invalid document value');
    });

    it('should throw if no document ID is provided', () => {
      expect(() => db.update({})).to.throw('rxCouch.db.update: _id is missing');
    });

    it('should throw if a revision ID is provided', () => {
      expect(() => db.update({_id: 'blah', _rev: '42-bogus'}))
        .to.throw('rxCouch.db.update: _rev is not allowed');
    });

    let initialRev;

    it('should create a new document if no existing document exists', function * () {
      const updateResponse = yield db.update({_id: 'update-test', foo: 'bar'}).shouldGenerateOneValue();
      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal('update-test');
      expect(updateResponse.ok).to.equal(true);
      expect(updateResponse.rev).to.match(/^1-/);
      initialRev = updateResponse.rev;

      const getResponse = yield db.get('update-test').shouldGenerateOneValue();
      expect(getResponse).to.deep.equal({
        _id: 'update-test',
        _rev: initialRev,
        foo: 'bar'
      });
    });

    it('should not alter the object that was provided to it', function * () {
      let updateObject = {_id: 'update-test-2', foo: 'bar'};
      const updateResponse = yield db.update(updateObject).shouldGenerateOneValue();

      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal('update-test-2');
      expect(updateObject).to.deep.equal({_id: 'update-test-2', foo: 'bar'});
    });

    it('should not create a new revision if nothing changed', function * () {
      const updateResponse = yield db.update({_id: 'update-test', foo: 'bar'}).shouldGenerateOneValue();

      expect(updateResponse).to.deep.equal({
        id: 'update-test',
        ok: true,
        rev: initialRev,
        noop: true
      });

      const value = yield db.get('update-test').shouldGenerateOneValue();
      expect(value).to.deep.equal({
        _id: 'update-test',
        _rev: initialRev,
        foo: 'bar'
      });
    });

    it('should update an existing document when new content is provided', function * () {
      const updateResponse = yield db.update({_id: 'update-test', foo: 'baz'}).shouldGenerateOneValue();

      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal('update-test');
      expect(updateResponse.ok).to.equal(true);
      expect(updateResponse.rev).to.be.match(/^2-/);
      let rev2 = updateResponse.rev;

      const value = yield db.get('update-test').shouldGenerateOneValue();
      expect(value).to.deep.equal({
        _id: 'update-test',
        _rev: rev2,
        foo: 'baz'
      });
    });
  });

  describe('.replace()', () => {
    it('should be defined', () => {
      expect(db).to.respondTo('replace');
    });

    it('should throw if no document value is provided', () => {
      expect(() => db.replace()).to.throw('rxCouch.db.replace: missing document value');
    });

    it('should throw if an invalid document value is provided', () => {
      expect(() => db.replace(42)).to.throw('rxCouch.db.replace: invalid document value');
    });

    it('should throw if no document ID is provided', () => {
      expect(() => db.replace({})).to.throw('rxCouch.db.replace: _id is missing');
    });

    it('should throw if a revision ID is provided', () => {
      expect(() => db.replace({_id: 'blah', _rev: '42-bogus'}))
        .to.throw('rxCouch.db.replace: _rev is not allowed');
    });

    let initialRev;

    it('should create a new document if no existing document exists', function * () {
      const replaceResponse = yield db.replace({_id: 'replace-test', foo: 'bar'}).shouldGenerateOneValue();

      expect(replaceResponse).to.be.an('object');
      expect(replaceResponse.id).to.equal('replace-test');
      expect(replaceResponse.ok).to.equal(true);
      expect(replaceResponse.rev).to.match(/^1-/);
      initialRev = replaceResponse.rev;

      const getResponse = yield db.get('replace-test').shouldGenerateOneValue();
      expect(getResponse).to.deep.equal({
        _id: 'replace-test',
        _rev: initialRev,
        foo: 'bar'
      });
    });

    it('should not alter the object that was provided to it', function * () {
      let replaceObject = {_id: 'replace-test-2', foo: 'bar'};
      const replaceResponse = yield db.replace(replaceObject).shouldGenerateOneValue();

      expect(replaceResponse).to.be.an('object');
      expect(replaceResponse.id).to.equal('replace-test-2');
      expect(replaceObject).to.deep.equal({_id: 'replace-test-2', foo: 'bar'});
    });

    it('should not create a new revision if nothing changed', function * () {
      const replaceResponse = yield db.replace({_id: 'replace-test', foo: 'bar'}).shouldGenerateOneValue();

      expect(replaceResponse).to.deep.equal({
        id: 'replace-test',
        ok: true,
        rev: initialRev,
        noop: true
      });

      const value = yield db.get('replace-test').shouldGenerateOneValue();
      expect(value).to.deep.equal({
        _id: 'replace-test',
        _rev: initialRev,
        foo: 'bar'
      });
    });

    it('should replace an existing document when new content is provided', function * () {
      const replaceResponse = yield db.replace({_id: 'replace-test', flip: 'baz'}).shouldGenerateOneValue();

      expect(replaceResponse).to.be.an('object');
      expect(replaceResponse.id).to.equal('replace-test');
      expect(replaceResponse.ok).to.equal(true);
      expect(replaceResponse.rev).to.be.match(/^2-/);
      let rev2 = replaceResponse.rev;

      const value = yield db.get('replace-test').shouldGenerateOneValue();
      expect(value).to.deep.equal({
        _id: 'replace-test',
        _rev: rev2,
        flip: 'baz'
        // foo should be removed
      });
    });
  });

  describe('.allDocs()', () => {
    it('should be defined', () => {
      expect(db).to.respondTo('delete');
    });

    it('should return summary information about all documents with no query options', function * () {
      const allDocsResult = yield db.allDocs().shouldGenerateOneValue();
      const simplifiedDocsResult = shallowCopy(allDocsResult);
      simplifiedDocsResult.rows = allDocsResult.rows.map(row => {
        if (typeof (row) !== 'object') {
          return row;
        } else {
          let rowCopy = shallowCopy(row);
          if (typeof (row.value) === 'object' && typeof (row.value.rev) === 'string') {
            rowCopy.value.rev = 'rev';
          }
          return rowCopy;
        }
      });

      expect(simplifiedDocsResult).to.deep.equal({
        offset: 0,
        rows: [
          {
            id: randomDocId,
            key: randomDocId,
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'replace-test',
            key: 'replace-test',
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'replace-test-2',
            key: 'replace-test-2',
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'testing123',
            key: 'testing123',
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'testing234',
            key: 'testing234',
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'update-test',
            key: 'update-test',
            value: {
              rev: 'rev'
            }
          },
          {
            id: 'update-test-2',
            key: 'update-test-2',
            value: {
              rev: 'rev'
            }
          }
        ],
        total_rows: 7
      });
    });

    it('should return full document values for some documents with appropriate query parameters', function * () {
      const allDocsResult = yield db.allDocs({
        startkey: 'testing123',
        endkey: 'testing234',
        include_docs: true
      }).shouldGenerateOneValue();

      const simplifiedDocsResult = shallowCopy(allDocsResult);
      simplifiedDocsResult.rows = allDocsResult.rows.map(row => {
        if (typeof (row) !== 'object') {
          return row;
        } else {
          let rowCopy = shallowCopy(row);
          if (typeof (row.doc) === 'object' && typeof (row.doc._rev) === 'string') {
            rowCopy.doc._rev = 'rev';
          }
          if (typeof (row.value) === 'object' && typeof (row.value.rev) === 'string') {
            rowCopy.value.rev = 'rev';
          }
          return rowCopy;
        }
      });

      expect(simplifiedDocsResult).to.deep.equal({
        offset: 3,
        rows: [
          {
            doc: {
              _id: 'testing123',
              _rev: 'rev',
              foo: 'baz'
            },
            id: 'testing123',
            key: 'testing123',
            value: {
              rev: 'rev'
            }
          },
          {
            doc: {
              _id: 'testing234',
              _rev: 'rev',
              foo: 'bar'
            },
            id: 'testing234',
            key: 'testing234',
            value: {
              rev: 'rev'
            }
          }
        ],
        total_rows: 7
      });
    });
  });

  describe('.delete()', () => {
    it('should be defined', () => {
      expect(db).to.respondTo('delete');
    });

    it('should throw if no document ID is provided', () => {
      expect(() => db.delete()).to.throw('rxCouch.db.delete: missing document ID');
    });

    it('should throw if an invalid document ID is provided', () => {
      expect(() => db.delete(42)).to.throw('rxCouch.db.delete: invalid document ID');
    });

    it('should throw if no revision ID is provided', () => {
      expect(() => db.delete('testing123')).to.throw('rxCouch.db.delete: missing revision ID');
    });

    it('should throw if an invalid revision ID is provided', () => {
      expect(() => db.delete('testing123', 42)).to.throw('rxCouch.db.delete: invalid revision ID');
    });

    it('should fail when _id matches an existing document but incorrect _rev is provided', function * () {
      const err = yield db.delete('testing123', 'bogus').shouldThrow();
      expect(err.message).to.equal('HTTP Error 400 on http://127.0.0.1:5984/test-rx-couch-db/testing123: Bad Request');
    });

    it('should delete an existing document when correct _id and _rev are provided', function * () {
      const deleteResponse = yield db.delete('testing123', rev2).shouldGenerateOneValue();
      expect(deleteResponse).to.be.an('object');
      expect(deleteResponse.id).to.equal('testing123');
      expect(deleteResponse.ok).to.equal(true);
      expect(deleteResponse.rev).to.match(/^3-/);
    });

    it('should actually have deleted the existing document', function * () {
      const err = yield db.get('testing123').shouldThrow();
      expect(err.message).to.equal('HTTP Error 404 on http://127.0.0.1:5984/test-rx-couch-db/testing123: Object Not Found');
    });
  });

  describe('.replicateFrom()', () => {
    const srcDb = server.db('test-rx-couch-clone-source');

    before('create test databases', function * () {
      yield server.createDatabase('test-rx-couch-clone-source').shouldBeEmpty();
      yield server.createDatabase('test-rx-couch-clone-target').shouldBeEmpty();
      let putObject = {_id: 'testing234', foo: 'bar'};
      yield srcDb.put(putObject).shouldGenerateOneValue();
    });

    after('destroy test databases', function * () {
      yield server.deleteDatabase('test-rx-couch-clone-source').shouldBeEmpty();
      yield server.deleteDatabase('test-rx-couch-clone-target').shouldBeEmpty();
    });

    it('should throw if options is missing', () => {
      expect(() => srcDb.replicateFrom()).to.throw('rxCouch.db.replicateFrom: options must be an object');
    });

    it('should throw if options is not an object', () => {
      expect(() => srcDb.replicateFrom('blah')).to.throw('rxCouch.db.replicateFrom: options must be an object');
    });

    it('should throw if options contains a "target" entry', () => {
      expect(() => srcDb.replicateFrom({
        source: 'test-rx-couch-clone-source',
        target: 'test-rx-couch-clone-target'
      })).to.throw('rxCouch.db.replicateFrom: options.target must not be specified');
    });

    it('should return an Observable with status information', function * () {
      const replResult = yield srcDb.replicateFrom({
        source: 'test-rx-couch-clone-source'
      }).shouldGenerateOneValue();

      expect(replResult).to.be.an('object');
      expect(replResult.ok).to.equal(true);
      expect(replResult.history).to.be.an('array');
    });
  });

  describe('.changes()', () => {
    it('should throw if options is not an object', () => {
      expect(() => db.changes('blah')).to.throw('rxCouch.db.changes: options must be an object');
    });

    it('should throw if options.feed === "continuous"', () => {
      expect(() => db.changes({feed: 'continuous'})).to.throw('rxCouch.db.changes: feed: "continuous" not supported');
    });

    it('should return summary information about all documents with no query options', function * () {
      const iter = db.changes()
        .skip(1)
        .map(result => {
          result.changes = 'changes suppressed';
          return result;
        })
        .toAsyncIterator();
        // Previous tests add one document with random ID.
        // Skip that since it will be hard to match.

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        id: 'testing234',
        seq: 3
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        id: 'update-test-2',
        seq: 6
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        id: 'update-test',
        seq: 7
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        id: 'replace-test-2',
        seq: 9
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        id: 'replace-test',
        seq: 10
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        deleted: true,
        id: 'testing123',
        seq: 11
      });

      yield iter.shouldComplete();
    });

    it('should return full document values for some documents with appropriate query parameters', function * () {
      const iter = db.changes({
        doc_ids: ['testing123', 'testing234'],
        filter: '_doc_ids',
        include_docs: true
      })
        .map(result => {
          result.changes = 'changes suppressed';
          result.doc._rev = 'rev ID suppressed';
          return result;
        })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          foo: 'bar'
        },
        id: 'testing234',
        seq: 3
      });

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        deleted: true,
        doc: {
          _deleted: true,
          _id: 'testing123',
          _rev: 'rev ID suppressed'
        },
        id: 'testing123',
        seq: 11
      });

      yield iter.shouldComplete();
    });

    it('should continuously monitor the database if feed: longpoll is used', function * () {
      const iter = db.changes({
        doc_ids: ['testing234'],
        feed: 'longpoll',
        filter: '_doc_ids',
        include_docs: true
      })
        .map(result => {
          result.changes = 'changes suppressed';
          result.doc._rev = 'rev ID suppressed';
          return result;
        })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          foo: 'bar'
        },
        id: 'testing234',
        seq: 3
      });

      yield db.update({_id: 'testing234', foo: 'blah'}).shouldGenerateOneValue();
        // Ignore result: Assume other tests have verified behavior of update method.

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          foo: 'blah'
        },
        id: 'testing234',
        seq: 12
      });

      yield db.update({_id: 'testing123', count: 38}).shouldGenerateOneValue();
        // Should generate no updates: We're not watching this document.

      yield db.update({_id: 'testing234', bop: 'blip'}).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          bop: 'blip',
          foo: 'blah'
        },
        id: 'testing234',
        seq: 14
      });

      iter.unsubscribe();
    });

    it('should stop monitoring the database when unsubscribed', function * () {
      const iter = db.changes({
        doc_ids: ['testing234'],
        feed: 'longpoll',
        filter: '_doc_ids',
        include_docs: true,
        timeout: 100
      })
        .map(result => {
          result.changes = 'changes suppressed';
          result.doc._rev = 'rev ID suppressed';
          return result;
        })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          bop: 'blip',
          foo: 'blah'
        },
        id: 'testing234',
        seq: 14
      });

      const fetchCountAtUnsubscribe = db._changesFetchCount;
        // Yes, this is hacky groping of the db object's internals.
        // Do not count on this member variable remaining present.

      iter.unsubscribe();

      yield Rx.Observable.timer(400).shouldGenerateOneValue();
        // Sleep through at least one (no-op) fetch cycle.

      expect(db._changesFetchCount).to.equal(fetchCountAtUnsubscribe);
    });

    it('should continue to monitor changes even if a timeout occurs', function * () {
      const iter = db.changes({
        doc_ids: ['testing234'],
        feed: 'longpoll',
        filter: '_doc_ids',
        include_docs: true,
        timeout: 500
      })
        .map(result => {
          result.changes = 'changes suppressed';
          result.doc._rev = 'rev ID suppressed';
          return result;
        })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          bop: 'blip',
          foo: 'blah'
        },
        id: 'testing234',
        seq: 14
      });

      yield Rx.Observable.timer(750).shouldGenerateOneValue();
        // Sleep past the 500ms timeout specified above.

      yield db.update({_id: 'testing234', foo: 'blam'}).shouldGenerateOneValue();
        // Ignore result: Assume other tests have verified behavior of update method.

      expect(yield iter.nextValue()).to.deep.equal({
        changes: 'changes suppressed',
        doc: {
          _id: 'testing234',
          _rev: 'rev ID suppressed',
          bop: 'blip',
          foo: 'blam'
        },
        id: 'testing234',
        seq: 15
      });

      iter.unsubscribe();
    });
  });

  describe('.observe()', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it('should throw if id is missing', () => {
      expect(() => db.observe()).to.throw('rxCouch.db.observe: missing document ID');
    });

    it('should throw if id is not a string', () => {
      expect(() => db.observe(42)).to.throw('rxCouch.db.observe: invalid document ID');
    });

    it('should send the current document value immediately if it exists, then update it with new value when it exists', function * () {
      const iter = db.observe('testing234')
        .map(doc => { delete doc._rev; return doc; })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing234',
        bop: 'blip',
        foo: 'blam'
      });

      yield db.update({_id: 'testing234', phone: 'ring'}).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing234',
        bop: 'blip',
        foo: 'blam',
        phone: 'ring'
      });

      iter.unsubscribe();
    });

    it('should return a placeholder if the document does not exist, then replace it with the correct value when it does exist', function * () {
      const iter = db.observe('testing987')
        .map(doc => { delete doc._rev; return doc; })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        _empty: true
      });

      yield db.update({_id: 'testing987', phone: 'ring'}).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'ring'
      });

      iter.unsubscribe();
    });

    it("should work even if the server doesn't support _doc_ids filter", function * () {
      // For example: Couchbase Lite on iOS ...
      const server = new RxCouch('http://localhost:5979');
      const db = server.db('test-rx-couch-db');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/testing987')
        .reply(200, '{"_id":"testing987","_rev":"1-9b37e2fd94778a46692565e0563a0a4f","phone":"ring"}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/_changes?doc_ids=%5B%22testing987%22%5D&feed=longpoll&filter=_doc_ids&include_docs=true')
        .reply(404, '{"error":"not_found","reason":"missing"}'); // CBL's way of saying not supported

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/_changes?feed=longpoll&include_docs=true&since=now')
        .delay(200)
        .reply(200, '{"results":[{"seq":17,"id":"testing987","changes":[{"rev":"1-9b37e2fd94778a46692565e0563a0a4f"}],"doc":{"_id":"testing987","_rev":"1-9b37e2fd94778a46692565e0563a0a4f","phone":"ring"}}],"last_seq":17}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/testing987')
        .reply(200, '{"_id":"testing987","_rev":"1-9b37e2fd94778a46692565e0563a0a4f","phone":"ring"}');

      nock('http://localhost:5979')
        .put('/test-rx-couch-db/testing987', '{"phone":"hup"}')
        .reply(201, '{"ok":true,"id":"testing987","rev":"2-35a5f4b576f2b82f80bc69e71178d236"}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/_changes?feed=longpoll&include_docs=true&since=17')
        .reply(200, '{"results":[{"seq":18,"id":"testing987","changes":[{"rev":"2-35a5f4b576f2b82f80bc69e71178d236"}],"doc":{"_id":"testing987","_rev":"2-35a5f4b576f2b82f80bc69e71178d236","phone":"hup"}}],"last_seq":18}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/_changes?feed=longpoll&include_docs=true&since=18')
        .delay(1000)
        .reply(200, '{"results":[],"last_seq":18}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/testing987')
        .reply(200, '{"_id":"testing987","_rev":"2-35a5f4b576f2b82f80bc69e71178d236","phone":"hup"}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/testing987')
        .reply(200, '{"_id":"testing987","_rev":"2-35a5f4b576f2b82f80bc69e71178d236","phone":"hup"}');

      nock('http://localhost:5979')
        .put('/test-rx-couch-db/testing987', '{"phone":"again?"}')
        .reply(201, '{"ok":true,"id":"testing987","rev":"3-mumble"}');

      nock('http://localhost:5979')
        .get('/test-rx-couch-db/_changes?feed=longpoll&include_docs=true&since=now')
        .delay(200)
        .reply(200, '{"results":[{"seq":19,"id":"testing987","changes":[{"rev":"3-mumble"}],"doc":{"_id":"testing987","_rev":"3-mumble","phone":"again?"}}],"last_seq":19}');

      const iter = db.observe('testing987')
        .map(doc => { delete doc._rev; return doc; })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'ring'
      });

      yield db.update({_id: 'testing987', phone: 'hup'}).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'hup'
      });

      expect(db._sharedChangesFeed).to.not.equal(undefined);
        // Hacky: Sniffing the implementation details.

      iter.unsubscribe();

      // Make sure we can start observing again after all previous
      // subscriptions have ended.

      expect(db._sharedChangesFeed).to.equal(undefined);
        // Hacky: Sniffing the implementation details.

      const iter2 = db.observe('testing987')
        .map(doc => { delete doc._rev; return doc; })
        .toAsyncIterator();

      expect(yield iter2.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'hup'
      });

      yield db.update({_id: 'testing987', phone: 'again?'}).shouldGenerateOneValue();

      expect(yield iter2.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'again?'
      });

      iter2.unsubscribe();
    });

    it('should return a placeholder if the document is deleted', function * () {
      let revId;

      const iter = db.observe('testing987')
        .map(doc => { revId = doc._rev; delete doc._rev; return doc; })
        .toAsyncIterator();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'ring'
      });

      yield db.delete('testing987', revId).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        _deleted: true
      });

      yield db.update({_id: 'testing987', phone: 'again?'}).shouldGenerateOneValue();

      expect(yield iter.nextValue()).to.deep.equal({
        _id: 'testing987',
        phone: 'again?'
      });
    });
  });
});
