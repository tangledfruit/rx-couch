'use strict';

require('co-mocha');
require('rx-to-async-iterator');

const Rx = require('rx');
const expect = require('chai').expect;
const nock = require('nock');
const rxCouch = require('../lib/server');
const shallowCopy = require('shallow-copy');


describe("rx-couch.db()", () => {

  const server = new rxCouch('http://127.0.0.1:5984');


  before("create test database", function* () {

    this.timeout(5000);

    const dbsAfterCreate = yield (Rx.Observable.concat(
      server.createDatabase('test-rx-couch-db'),
      server.allDatabases())).shouldGenerateOneValue();

    expect(dbsAfterCreate).to.be.an('array');
    expect(dbsAfterCreate).to.include('test-rx-couch-db');

  });


  after("remove test database", function* () {

    this.timeout(5000);

    const dbsAfterDelete = yield (Rx.Observable.concat(
      server.deleteDatabase('test-rx-couch-db'),
      server.allDatabases())).shouldGenerateOneValue();

    expect(dbsAfterDelete).to.be.an('array');
    expect(dbsAfterDelete).to.not.include('test-rx-couch-db');

  });


  it("should be defined", () => {
    expect(server).to.respondTo('db');
  });

  it("should throw if database name is missing", () => {
    expect(() => server.db()).to.throw("rxCouch.db: dbName must be a string");
  });

  it("should throw if database name is empty", () => {
    expect(() => server.db('')).to.throw("rxCouch.db: illegal dbName");
  });

  it("should throw if database name is illegal", () => {
    expect(() => server.db('noCapitalLetters')).to.throw("rxCouch.db: illegal dbName");
  });

  it("should throw if database name is illegal", () => {
    expect(() => server.db('_users')).to.throw("rxCouch.db: illegal dbName");
  });


  const db = server.db('test-rx-couch-db');
    // Defined out of scope because we use it throughout this test suite.

  it("should return an object", () => {
    expect(db).to.be.an('object');
  });


  let randomDocId;
  let rev1, rev2;

  describe(".put()", () => {

    it("should be defined", () => {
      expect(db).to.respondTo('put');
    });

    it("should throw if no document value is provided", () => {
      expect(() => db.put()).to.throw("rxCouch.db.put: missing document value");
    });

    it("should throw if an invalid document value is provided", () => {
      expect(() => db.put(42)).to.throw("rxCouch.db.put: invalid document value");
    });


    it("should assign a document ID if no document ID is provided", function* () {

      // http://docs.couchdb.org/en/latest/api/database/common.html#post--db

      const putResponse = yield db.put({foo: "bar"}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.be.a('string');
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.be.a('string');

      randomDocId = putResponse.id;

    });


    it("should create a new document using specific ID if provided", function* () {

      // http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid

      const putResponse = yield db.put({"_id": "testing123", foo: "bar"}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal("testing123");
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.match(/^1-/);
      rev1 = putResponse.rev;

    });


    it("should not alter the object that was provided to it", function* () {

      // http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid

      let putObject = {"_id": "testing234", foo: "bar"};
      const putResponse = yield db.put(putObject).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal("testing234");
      expect(putObject).to.deep.equal({"_id": "testing234", foo: "bar"});

    });


    it("should update an existing document when _id and _rev are provided", function* () {

      const putResponse = yield db.put({"_id": "testing123", "_rev": rev1, foo: "baz"}).shouldGenerateOneValue();

      expect(putResponse).to.be.an('object');
      expect(putResponse.id).to.equal("testing123");
      expect(putResponse.ok).to.equal(true);
      expect(putResponse.rev).to.be.match(/^2-/);
      rev2 = putResponse.rev;

    });


    it("should fail when _id matches an existing document but no _rev is provided", function* () {

      const err = yield db.put({"_id": "testing123", foo: "bar"}).shouldThrow();
      expect(err.message).to.equal("HTTP Error 409: Conflict");

    });


    it("should fail when _id matches an existing document but incorrect _rev is provided", function* () {

      const err = yield db.put({"_id": "testing123", "_rev": "bogus", foo: "bar"}).shouldThrow();
      expect(err.message).to.equal("HTTP Error 400: Bad Request");

    });

  });


  describe(".get()", () => {

    // http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid

    it("should be defined", () => {
      expect(db).to.respondTo('get');
    });

    it("should throw if no document ID is provided", () => {
      expect(() => db.get()).to.throw("rxCouch.db.get: missing document ID");
    });

    it("should throw if an invalid document ID is provided", () => {
      expect(() => db.get(42)).to.throw("rxCouch.db.get: invalid document ID");
    });


    it("should retrieve a document's current value if no options are provided", function* () {

      const getResponse = yield db.get("testing123").shouldGenerateOneValue();

      expect(getResponse).to.be.an('object');
      expect(getResponse._id).to.equal("testing123");
      expect(getResponse._rev).to.match(/^2-/);
      expect(getResponse.foo).to.equal('baz');

    });


    it("should pass through options when provided", function* () {

      const getResponse = yield db.get("testing123", {"rev": rev1}).shouldGenerateOneValue();

      expect(getResponse).to.be.an('object');
      expect(getResponse._id).to.equal("testing123");
      expect(getResponse._rev).to.match(/^1-/);
      expect(getResponse.foo).to.equal('bar');

    });


    it("should fail when _id doesn't match an existing document", function* () {

      const err = yield db.get("testing432").shouldThrow();
      expect(err.message).to.equal("HTTP Error 404: Not Found");

    });

  });


  describe(".update()", () => {

    it("should be defined", () => {
      expect(db).to.respondTo('update');
    });

    it("should throw if no document value is provided", () => {
      expect(() => db.update()).to.throw("rxCouch.db.update: missing document value");
    });

    it("should throw if an invalid document value is provided", () => {
      expect(() => db.update(42)).to.throw("rxCouch.db.update: invalid document value");
    });

    it("should throw if no document ID is provided", () => {
      expect(() => db.update({})).to.throw("rxCouch.db.update: _id is missing");
    });

    it("should throw if a revision ID is provided", () => {
      expect(() => db.update({"_id": "blah", "_rev": "42-bogus"}))
        .to.throw("rxCouch.db.update: _rev is not allowed");
    });


    let initialRev;

    it("should create a new document if no existing document exists", function* () {

      const updateResponse = yield db.update({"_id": "update-test", foo: "bar"}).shouldGenerateOneValue();

      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal("update-test");
      expect(updateResponse.ok).to.equal(true);
      expect(updateResponse.rev).to.match(/^1-/);
      initialRev = updateResponse.rev;

      const getResponse = yield db.get("update-test").shouldGenerateOneValue();
      expect(getResponse).to.deep.equal({
        "_id": "update-test",
        "_rev": initialRev,
        foo: "bar"
      });

    });


    it("should not alter the object that was provided to it", function* () {

      let updateObject = {"_id": "update-test-2", foo: "bar"};
      const updateResponse = yield db.update(updateObject).shouldGenerateOneValue();

      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal("update-test-2");
      expect(updateObject).to.deep.equal({"_id": "update-test-2", foo: "bar"});

    });


    it("should not create a new revision if nothing changed", function* () {

      const updateResponse = yield db.update({"_id": "update-test", foo: "bar"}).shouldGenerateOneValue();

      expect(updateResponse).to.deep.equal({
        id: "update-test",
        ok: true,
        rev: initialRev,
        noop: true
      });

      const value = yield db.get("update-test").shouldGenerateOneValue();
      expect(value).to.deep.equal({
        "_id": "update-test",
        "_rev": initialRev,
        foo: "bar"
      });

    });


    it("should update an existing document when new content is provided", function* () {

      const updateResponse = yield db.update({"_id": "update-test", foo: "baz"}).shouldGenerateOneValue();

      expect(updateResponse).to.be.an('object');
      expect(updateResponse.id).to.equal("update-test");
      expect(updateResponse.ok).to.equal(true);
      expect(updateResponse.rev).to.be.match(/^2-/);
      let rev2 = updateResponse.rev;

      const value = yield db.get("update-test").shouldGenerateOneValue();
      expect(value).to.deep.equal({
        "_id": "update-test",
        "_rev": rev2,
        foo: "baz"
      });

    });

  });


  describe(".allDocs()", () => {

    it("should be defined", () => {
      expect(db).to.respondTo('delete');
    });


    it("should return summary information about all documents with no query options", function* () {

      const allDocsResult = yield db.allDocs().shouldGenerateOneValue();

      const simplifiedDocsResult = shallowCopy(allDocsResult);
      simplifiedDocsResult.rows = allDocsResult.rows.map(row => {
        if (typeof(row) !== 'object') {
          return row;
        } else {
          let rowCopy = shallowCopy(row);
          if (typeof(row.value) === 'object' && typeof(row.value.rev) === 'string') {
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
                rev: "rev"
              }
            },
            {
              id: "testing123",
              key: "testing123",
              value: {
                rev: "rev"
              }
            },
            {
              id: "testing234",
              key: "testing234",
              value: {
                rev: "rev"
              }
            },
            {
              id: "update-test",
              key: "update-test",
              value: {
                rev: "rev"
              }
            },
            {
              id: "update-test-2",
              key: "update-test-2",
              value: {
                rev: "rev"
              }
            }
          ],
          total_rows: 5
      });

    });


    it("should return full document values for some documents with appropriate query parameters", function* () {

      const allDocsResult = yield db.allDocs({
        startkey: "testing123",
        endkey: "testing234",
        include_docs: true
      }).shouldGenerateOneValue();

      const simplifiedDocsResult = shallowCopy(allDocsResult);
      simplifiedDocsResult.rows = allDocsResult.rows.map(row => {
        if (typeof(row) !== 'object') {
          return row;
        } else {
          let rowCopy = shallowCopy(row);
          if (typeof(row.doc) === 'object' && typeof(row.doc._rev) === 'string') {
            rowCopy.doc._rev = 'rev';
          }
          if (typeof(row.value) === 'object' && typeof(row.value.rev) === 'string') {
            rowCopy.value.rev = 'rev';
          }
          return rowCopy;
        }
      });

      expect(simplifiedDocsResult).to.deep.equal({
          offset: 1,
          rows: [
            {
              doc: {
                _id: "testing123",
                _rev: "rev",
                foo: "baz"
              },
              id: "testing123",
              key: "testing123",
              value: {
                rev: "rev"
              }
            },
            {
              doc: {
                _id: "testing234",
                _rev: "rev",
                foo: "bar"
              },
              id: "testing234",
              key: "testing234",
              value: {
                rev: "rev"
              }
            }
          ],
          total_rows: 5
      });

    });

  });


  describe(".delete()", () => {

    it("should be defined", () => {
      expect(db).to.respondTo('delete');
    });

    it("should throw if no document ID is provided", () => {
      expect(() => db.delete()).to.throw("rxCouch.db.delete: missing document ID");
    });

    it("should throw if an invalid document ID is provided", () => {
      expect(() => db.delete(42)).to.throw("rxCouch.db.delete: invalid document ID");
    });

    it("should throw if no revision ID is provided", () => {
      expect(() => db.delete('testing123')).to.throw("rxCouch.db.delete: missing revision ID");
    });

    it("should throw if an invalid revision ID is provided", () => {
      expect(() => db.delete('testing123', 42)).to.throw("rxCouch.db.delete: invalid revision ID");
    });


    it("should fail when _id matches an existing document but incorrect _rev is provided", function* () {

      const err = yield db.delete('testing123', 'bogus').shouldThrow();
      expect(err.message).to.equal("HTTP Error 400: Bad Request");

    });


    it("should delete an existing document when correct _id and _rev are provided", function* () {

      const deleteResponse = yield db.delete("testing123", rev2).shouldGenerateOneValue();
      expect(deleteResponse).to.be.an('object');
      expect(deleteResponse.id).to.equal("testing123");
      expect(deleteResponse.ok).to.equal(true);
      expect(deleteResponse.rev).to.match(/^3-/);

    });


    it("should actually have deleted the existing document", function* () {

      const err = yield db.get('testing123').shouldThrow();
      expect(err.message).to.equal("HTTP Error 404: Not Found");

    });

  });

});
