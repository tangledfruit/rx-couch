'use strict';

const rxFetch = require('rx-fetch');
const url = require('url');

//------------------------------------------------------------------------------

var db = module.exports = function (dbUrl) {

  // Since this function is only accessible internally, we assume that dbUrl
  // has been validated already.

  this._dbUrl = dbUrl;

};
