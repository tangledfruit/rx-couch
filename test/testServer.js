'use strict';

require('co-mocha');
require('rx-to-async-iterator');

const Rx = require('rx');
const expect = require('chai').expect;
const nock = require('nock');
const rxCouch = require('../lib/server');


describe("rx-couch", () => {

  it("should be defined", () => {
    expect(rxCouch).to.be.a('function');
  });


  it("should fail if called as a non-constructor", () => {

    expect(() => rxCouch('http://localhost:5984')).to.throw(/new rxCouch/);
        // WRONG: should be `new rxCouch(...)`!

  });


  it("should fail for malformed URL", () => {

    const badIdea = function () {
      return new rxCouch("not a valid URL");
    };

    expect(() => new rxCouch("not a valid URL")).
      to.throw(/CouchDB server must not contain a path or query string/);

  });


  it("should fail for URL containing a database path", () => {

    expect(() => new rxCouch('http://localhost:5984/some_db')).
      to.throw(/CouchDB server must not contain a path or query string/);

  });


  const server = new rxCouch();
    // Outside an 'it' scope since we reuse this through the rest of the file.

  it("should return a server object", () => {
    expect(server).to.be.an('object');
  });


  describe(".allDatabases()", () => {

    it("should return an Observable which yields a list of databases", function* () {

      const databases = yield server.allDatabases().shouldGenerateOneValue();

      expect(databases).to.be.an('array');
      databases.forEach((dbName) => { expect(dbName).to.be.a('string'); });
      expect(databases).to.include('_users');

    });

  });


  describe(".createDatabase()", () => {

    it("should return an Observable which sends only onCompleted when done", function* () {
      yield server.createDatabase('test-rx-couch').shouldBeEmpty();
    });

    it("should succeed even if the database already exists", function* () {
      yield server.createDatabase('test-rx-couch').shouldBeEmpty();
    });

    it("should succeed even if the database already exists {failIfExists: false}", function* () {
      yield server.createDatabase('test-rx-couch').shouldBeEmpty();
    });

    it("should throw if database name is missing", () => {
      expect(() => server.createDatabase()).to.throw("rxCouch.createDatabase: dbName must be a string");
    });

    it('should throw if database name is empty', () => {
      expect(() => server.createDatabase('')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it("should throw if database name is illegal", () => {
      expect(() => server.createDatabase('dontUppercaseMe')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it("should throw if database name starts with underscore", () => {
      expect(() => server.createDatabase('_users')).to.throw("rxCouch.createDatabase: illegal dbName");
    });

    it('should throw if options is present, but not an object', () => {
      expect(() => server.createDatabase('x', 42)).to.throw("rxCouch.createDatabase: options, if present, must be an object");
    });

    it('should throw if options.failIfExists is present, but not a boolean', () => {
      expect(() => server.createDatabase('x', {failIfExists: "bogus"})).to.throw("rxCouch.createDatabase: options.failIfExists, if present, must be a boolean");
    });


    it("should actually create a new database", function* () {

      const dbsAfterCreate = yield (Rx.Observable.concat(
        server.createDatabase('test-rx-couch'),
        server.allDatabases())).shouldGenerateOneValue();

      expect(dbsAfterCreate).to.be.an('array');
      expect(dbsAfterCreate).to.include('test-rx-couch');

    });


    it("should signal an error if database already exists (but only if so requested)", function* () {

      const err = yield server.createDatabase('test-rx-couch', {failIfExists: true}).shouldThrow();
      expect(err.message).to.equal("HTTP Error 412: Precondition Failed");

    });


    it("should send an onError message if server yields unexpected result", function* () {

      nock('http://localhost:5979')
        .put('/test-rx-couch')
        .reply(500);

      const err = yield (new rxCouch('http://localhost:5979').createDatabase('test-rx-couch')).shouldThrow();
      expect(err.message).to.equal("HTTP Error 500: Internal Server Error");

    });

  });


  describe(".deleteDatabase()", () => {

    nock.cleanAll();

    it("should return an Observable which sends only onCompleted when done", function* () {
      yield server.deleteDatabase('test-rx-couch').shouldBeEmpty();
    });

    it("should succeed even if the database doesn't already exist", function* () {
      yield server.deleteDatabase('test-rx-couch').shouldBeEmpty();
    });

    it("should throw if database name is missing", () => {
      expect(() => server.deleteDatabase()).to.throw("rxCouch.deleteDatabase: dbName must be a string");
    });

    it("should throw if database name is empty", () => {
      expect(() => server.deleteDatabase('')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });

    it("should throw if database name is illegal", () => {
      expect(() => server.deleteDatabase('noCapitalLetters')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });

    it("should throw if database name starts with underscore", () => {
      expect(() => server.deleteDatabase('_users')).to.throw("rxCouch.deleteDatabase: illegal dbName");
    });


    it("should actually delete the existing database", function* () {

      const dbsAfterDelete = yield (Rx.Observable.concat(
        server.deleteDatabase('test-rx-couch'),
        server.allDatabases())).shouldGenerateOneValue();

      expect(dbsAfterDelete).to.be.an('array');
      expect(dbsAfterDelete).to.not.include('test-rx-couch');

    });


    it("should send an onError message if server yields unexpected result", function* () {

      nock('http://localhost:5979')
        .delete('/test-rx-couch')
        .reply(500);

      const err = yield (new rxCouch('http://localhost:5979').deleteDatabase('test-rx-couch')).shouldThrow();
      expect(err.message).to.equal("HTTP Error 500: Internal Server Error");

    });

  });

});
