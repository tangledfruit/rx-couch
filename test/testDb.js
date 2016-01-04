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

    var rev1;

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

      const putResult = db.put({"_id": "testing123", "_rev": rev1, foo: "bar"});

      expectOneResult(putResult, done,
        (putResponse) => {
          expect(putResponse).to.be.an('object');
          expect(putResponse.id).to.equal("testing123");
          expect(putResponse.ok).to.equal(true);
          expect(putResponse.rev).to.be.match(/^2-/);
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

});
