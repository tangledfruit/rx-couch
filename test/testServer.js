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

describe("rx-couch", function () {

  it("should be defined", function () {

    expect(rxCouch).to.be.a('function');

  });

  //----------------------------------------------------------------------------

  it("should fail if called as a non-constructor", function () {

    expect(function () {
      return rxCouch('http://localhost:5984');
        // WRONG: should be `new rxCouch(...)`!
    }).to.throw(/new rxCouch/);

  });

  //----------------------------------------------------------------------------

  it("should fail for malformed URL", function () {

    const badIdea = function () {
      return new rxCouch("not a valid URL");
    };

    expect(badIdea).to.throw(/CouchDB server must not contain a path or query string/);

  });

  //----------------------------------------------------------------------------

  it("should fail for URL containing a database path", function () {

    const badIdea = function () {
      return new rxCouch('http://localhost:5984/some_db');
    };

    expect(badIdea).to.throw(/CouchDB server must not contain a path or query string/);

  });

  //----------------------------------------------------------------------------

  const server = new rxCouch();
    // Outside an 'it' scope since we reuse this through the rest of the file.

  it("should return a server object", function () {

    expect(server).to.be.an('object');

  });

  //----------------------------------------------------------------------------

  describe(".allDatabases()", function () {

    it("should return an Observable which yields a list of databases", function (done) {

      const dbsResult = server.allDatabases();

      expectOneResult(dbsResult, done,
        (databases) => {
          expect(databases).to.be.an('array');
          databases.forEach((dbName) => {
            expect(dbName).to.be.a('string');
          });
          expect(databases).to.include('_users');
        });

    });

  });

  //----------------------------------------------------------------------------

  describe(".createDatabase()", function () {

    it("should return an Observable which sends only onCompleted when done", function (done) {
      expectNoResults(server.createDatabase('test-rx-couch'), done);
    });

    it("should succeed even if the database already exists", function (done) {
      expectNoResults(server.createDatabase('test-rx-couch'), done);
    });

    it("should throw if database name is missing", function () {
      expect(() => server.createDatabase()).to.throw("rxCouch.createDatabase: dbName must be a string");
    });

    it('should throw if database name is empty', function () {
      expect(() => server.createDatabase('')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it("should throw if database name is illegal", function () {
      expect(() => server.createDatabase('noCapitalLetters')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it("should throw if database name starts with underscore", function () {
      expect(() => server.createDatabase('_users')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it("should actually create a new database", function (done) {

      const dbsAfterCreate = Rx.Observable.concat(
        server.createDatabase('test-rx-couch'),
        server.allDatabases());

      expectOneResult(dbsAfterCreate, done,
        (databases) => {
          expect(databases).to.be.an('array');
          expect(databases).to.include('test-rx-couch');
        });

    });

    it("should send an onError message if server yields unexpected result", function (done) {

      nock('http://localhost:5979')
        .put('/test-rx-couch')
        .reply(500);

      expectOnlyError(new rxCouch('http://localhost:5979').createDatabase('test-rx-couch'), done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 500: Internal Server Error");
        });

    });

  });

  //----------------------------------------------------------------------------

  describe(".deleteDatabase()", function () {

    nock.cleanAll();

    it("should return an Observable which sends only onCompleted when done", function (done) {
      expectNoResults(server.deleteDatabase('test-rx-couch'), done);
    });

    it("should succeed even if the database doesn\'t already exist", function (done) {
      expectNoResults(server.deleteDatabase('test-rx-couch'), done);
    });

    it("should throw if database name is missing", function () {
      expect(() => server.deleteDatabase()).to.throw("rxCouch.deleteDatabase: dbName must be a string");
    });

    it("should throw if database name is empty", function () {
      expect(() => server.deleteDatabase('')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });

    it("should throw if database name is illegal", function () {
      expect(() => server.deleteDatabase('noCapitalLetters')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });

    it("should throw if database name starts with underscore", function () {
      expect(() => server.deleteDatabase('_users')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });

    it("should actually delete the existing database", function (done) {

      const dbsAfterDelete = Rx.Observable.concat(
        server.deleteDatabase('test-rx-couch'),
        server.allDatabases());

      expectOneResult(dbsAfterDelete, done,
        (databases) => {
          expect(databases).to.be.an('array');
          expect(databases).to.not.include('test-rx-couch');
        });

    });

    it("should send an onError message if server yields unexpected result", function (done) {

      nock('http://localhost:5979')
        .delete('/test-rx-couch')
        .reply(500);

      expectOnlyError(new rxCouch('http://localhost:5979').deleteDatabase('test-rx-couch'), done,
        (err) => {
          expect(err.message).to.equal("HTTP Error 500: Internal Server Error");
        });

    });

  });

});
