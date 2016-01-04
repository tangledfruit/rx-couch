'use strict';

const Rx = require('rx');
const rxCouch = require('../lib/server');
const expect = require('chai').expect;
const nock = require('nock');

//------------------------------------------------------------------------------

const expectOneResult = function (observable, done, match) {

  var didSendData = false;
  var failure;

  observable.subscribe(

    function (value) {
      try {
        if (didSendData && !failure)
          failure = new Error("Unexpected second result: ", value);
        else
          match(value);
      }
      catch (err) {
        failure = err;
      }
    },

    function (err) {
      done(err);
    },

    function () {
      done(failure);
    });

};

//------------------------------------------------------------------------------

const expectNoResults = function (observable, done) {

  var failure;

  observable.subscribe(
    function (value) {
      if (!failure)
        failure = new Error("Unexpected value: ", value);
    },
    function (err) {
      done(err);
    },
    function () {
      done(failure);
    });

};

//------------------------------------------------------------------------------

const expectOnlyError = function (observable, done, match) {

  expect(match).to.be.a('function');

  var didSendData = false;
  var failure;

  observable.subscribe(

    function (value) {
      if (!failure)
        failure = new Error("onNext was called with value: ", value);
    },

    function (err) {
      if (!failure) {
        try {
          match(err);
        }
        catch (err) {
          failure = err;
        }
      }
      done(failure);
    },

    function () {
      done(new Error("onCompleted was called"));
    });

};

//------------------------------------------------------------------------------

describe("rx-couch.db()", function () {

  const server = new rxCouch('http://127.0.0.1:5984');

  //----------------------------------------------------------------------------

  before("create test database", function (done) {

    this.timeout(5000);

    const dbsAfterCreate = Rx.Observable.concat(
      server.createDatabase('test-rx-couch-db'),
      server.allDatabases());

    expectOneResult(dbsAfterCreate, done,
      (databases) => {
        expect(databases).to.be.an('array');
        expect(databases).to.include('test-rx-couch-db');
      });

  });

  //----------------------------------------------------------------------------

  after("remove test database", function (done) {

    this.timeout(5000);

    const dbsAfterDelete = Rx.Observable.concat(
      server.deleteDatabase('test-rx-couch-db'),
      server.allDatabases());

    expectOneResult(dbsAfterDelete, done,
      (databases) => {
        expect(databases).to.be.an('array');
        expect(databases).to.not.include('test-rx-couch-db');
      });

  });

  //----------------------------------------------------------------------------

  it("should be defined", function () {
    expect(server).to.respondTo('db');
  });

  it("should throw if database name is missing", function () {
    expect(() => server.db()).to.throw("rxCouch.db: dbName must be a string");
  });

  it("should throw if database name is empty", function () {
    expect(() => server.db('')).to.throw("rxCouch.db: illegal dbName");
  });

  it("should throw if database name is illegal", function () {
    expect(() => server.db('noCapitalLetters')).to.throw("rxCouch.db: illegal dbName");
  });

  it("should throw if database name is illegal", function () {
    expect(() => server.db('_users')).to.throw("rxCouch.db: illegal dbName");
  });

  //----------------------------------------------------------------------------

  const db = server.db('test-rx-couch-db');
    // Defined out of scope because we use it throughout this test suite.

  it("should return an object", function () {
    expect(db).to.be.an('object');
  });

  //----------------------------------------------------------------------------

  var rev1, rev2;

  describe(".put()", function () {

    it("should be defined", function () {
      expect(db).to.respondTo('put');
    });

    it("should throw if no document value is provided", function () {
      expect(() => db.put()).to.throw("rxCouch.db.put: missing document value");
    });

    it("should throw if an invalid document value is provided", function () {
      expect(() => db.put(42)).to.throw("rxCouch.db.put: invalid document value");
    });

    //--------------------------------------------------------------------------

    it("should assign a document ID if no document ID is provided", function (done) {

      // http://docs.couchdb.org/en/latest/api/database/common.html#post--db

      const putResult = db.put({foo: "bar"});

      expectOneResult(putResult, done,
        (putResponse) => {
          expect(putResponse).to.be.an('object');
          expect(putResponse.id).to.be.a('string');
          expect(putResponse.ok).to.equal(true);
          expect(putResponse.rev).to.be.a('string');
        });

    });

    //--------------------------------------------------------------------------

    it("should create a new document using specific ID if provided", function (done) {

      // http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid

      const putResult = db.put({"_id": "testing123", foo: "bar"});

      expectOneResult(putResult, done,
        (putResponse) => {
          expect(putResponse).to.be.an('object');
          expect(putResponse.id).to.equal("testing123");
          expect(putResponse.ok).to.equal(true);
          expect(putResponse.rev).to.match(/^1-/);
          rev1 = putResponse.rev;
        });

    });

    //--------------------------------------------------------------------------

    it("should update an existing document when _id and _rev are provided", function (done) {

      const putResult = db.put({"_id": "testing123", "_rev": rev1, foo: "baz"});

      expectOneResult(putResult, done,
        (putResponse) => {
          expect(putResponse).to.be.an('object');
          expect(putResponse.id).to.equal("testing123");
          expect(putResponse.ok).to.equal(true);
          expect(putResponse.rev).to.be.match(/^2-/);
          rev2 = putResponse.rev;
        });

    });

    //--------------------------------------------------------------------------

    it("should fail when _id matches an existing document but no _rev is provided", function (done) {

      const putResult = db.put({"_id": "testing123", foo: "bar"});

      expectOnlyError(putResult, done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 409: Conflict");
        });

    });

    //--------------------------------------------------------------------------

    it("should fail when _id matches an existing document but incorrect _rev is provided", function (done) {

      const putResult = db.put({"_id": "testing123", "_rev": "bogus", foo: "bar"});

      expectOnlyError(putResult, done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 400: Bad Request");
        });

    });

  });

  //----------------------------------------------------------------------------

  describe(".get()", function () {

    // http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid

    it("should be defined", function () {
      expect(db).to.respondTo('get');
    });

    it("should throw if no document ID is provided", function () {
      expect(() => db.get()).to.throw("rxCouch.db.get: missing document ID");
    });

    it("should throw if an invalid document ID is provided", function () {
      expect(() => db.get(42)).to.throw("rxCouch.db.get: invalid document ID");
    });

    //--------------------------------------------------------------------------

    it("should retrieve a document's current value if no options are provided", function (done) {

      const getResult = db.get("testing123");

      expectOneResult(getResult, done,
        (getResponse) => {
          expect(getResponse).to.be.an('object');
          expect(getResponse._id).to.equal("testing123");
          expect(getResponse._rev).to.match(/^2-/);
          expect(getResponse.foo).to.equal('baz');
        });

    });

    //--------------------------------------------------------------------------

    it("should pass through options when provided", function (done) {

      const getResult = db.get("testing123", {"rev": rev1});

      expectOneResult(getResult, done,
        (getResponse) => {
          expect(getResponse).to.be.an('object');
          expect(getResponse._id).to.equal("testing123");
          expect(getResponse._rev).to.match(/^1-/);
          expect(getResponse.foo).to.equal('bar');
        });

    });

    //--------------------------------------------------------------------------

    it("should fail when _id doesn't match an existing document", function (done) {

      const getResult = db.get("testing432");

      expectOnlyError(getResult, done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 404: Not Found");
        });

    });

  });

  //----------------------------------------------------------------------------

  describe(".delete()", function () {

    it("should be defined", function () {
      expect(db).to.respondTo('delete');
    });

    it("should throw if no document ID is provided", function () {
      expect(() => db.delete()).to.throw("rxCouch.db.delete: missing document ID");
    });

    it("should throw if an invalid document ID is provided", function () {
      expect(() => db.delete(42)).to.throw("rxCouch.db.delete: invalid document ID");
    });

    it("should throw if no revision ID is provided", function () {
      expect(() => db.delete('testing123')).to.throw("rxCouch.db.delete: missing revision ID");
    });

    it("should throw if an invalid revision ID is provided", function () {
      expect(() => db.delete('testing123', 42)).to.throw("rxCouch.db.delete: invalid revision ID");
    });

    //--------------------------------------------------------------------------

    it("should fail when _id matches an existing document but incorrect _rev is provided", function (done) {

      const deleteResult = db.delete('testing123', 'bogus');

      expectOnlyError(deleteResult, done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 400: Bad Request");
        });

    });

    //--------------------------------------------------------------------------

    it("should delete an existing document when correct _id and _rev are provided", function (done) {

      const deleteResult = db.delete("testing123", rev2);

      expectOneResult(deleteResult, done,
        (deleteResponse) => {
          expect(deleteResponse).to.be.an('object');
          expect(deleteResponse.id).to.equal("testing123");
          expect(deleteResponse.ok).to.equal(true);
          expect(deleteResponse.rev).to.match(/^3-/);
        });

    });

    //--------------------------------------------------------------------------

    it("should actually have deleted the existing document", function (done) {

      const getResult = db.get('testing123');

      expectOnlyError(getResult, done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 404: Not Found");
        });

    });

  });

});
