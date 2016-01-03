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

describe('rx-couch.db()', function () {

  const server = new rxCouch('http://127.0.0.1:5984');

  //----------------------------------------------------------------------------

  before("create test database", function (done) {

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

  it('should be defined', function () {
    expect(server).to.respondTo('db');
  });

  it('should throw if database name is missing', function () {
    expect(() => server.db()).to.throw("rxCouch.db: dbName must be a string");
  });

  it('should throw if database name is empty', function () {
    expect(() => server.db('')).to.throw("rxCouch.db: illegal dbName");
  });

  it('should throw if database name is illegal', function () {
    expect(() => server.db('noCapitalLetters')).to.throw("rxCouch.db: illegal dbName");
  });

  it('should throw if database name is illegal', function () {
    expect(() => server.db('_users')).to.throw("rxCouch.db: illegal dbName");
  });

  //----------------------------------------------------------------------------

  var testDb = server.db('rx-couch-test-db');
    // Defined out of scope because we use it throughout this test suite.

  it('should return an object', function () {
    expect(testDb).to.be.an('object');
  });

});
