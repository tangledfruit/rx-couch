# rx-couch [![Build Status](https://travis-ci.org/tangledfruit/rx-couch.svg?branch=master)](https://travis-ci.org/tangledfruit/rx-couch) [![Coverage Status](https://coveralls.io/repos/tangledfruit/rx-couch/badge.svg?branch=master&service=github)](https://coveralls.io/github/tangledfruit/rx-couch?branch=master)

RxJS-flavored APIs for CouchDB

## Installation

### NPM

```sh
npm install --save rx-couch
```

## Usage

```js
const rxCouch = require('rx-couch');

const server = new rxCouch('http://my.host:5984');

// List all databases on the server.
// http://docs.couchdb.org/en/latest/api/server/common.html#all-dbs
server.allDatabases()
  .subscribe(databases => console.log(databases));
  // -> ["_replicator", "_users", "my-database", etc...]

// Create a database. By default, this will ignore 412 errors on the assumption
// that this means "database already exists."
// http://docs.couchdb.org/en/latest/api/database/common.html#put--db
server.createDatabase('test-rx-couch')
  .subscribeOnCompleted(); // fires when done

// Create a database and fail if the database already exists.
// http://docs.couchdb.org/en/latest/api/database/common.html#put--db
server.createDatabase('test-rx-couch', {failIfExists: true})
  .subscribeOnError(); // In this example, an error event would be sent.

// Delete a database.
// http://docs.couchdb.org/en/latest/api/database/common.html#delete--db
server.deleteDatabase('some-other-database')
  .subscribeOnCompleted(); // fires when done

// Create a database object to interact with a single database on the server.
// WARNING: Does not create the database. See .createDatabase above.
const db = server.db('test-rx-couch');

// Create a new document and let CouchDB assign an ID.
// http://docs.couchdb.org/en/latest/api/database/common.html#post--db
db.put({foo: "bar"})
  .subscribe(result => console.log(result));
  // -> {"id": "(random)", ok: true, "rev": "1-(random)"}

// Create a new document using an ID that I choose.
// http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
db.put({_id: "testing123", foo: "bar"})
  .subscribe(result => console.log(result));
  // -> {"id": "testing123", ok: true, "rev": "1-(random)"}

// Update an existing document, replacing existing value
// http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
db.put({_id: "testing123", _rev: "1-existingRevId", foo: "baz"})
  .subscribe(result => console.log(result));
  // -> {"id": "testing123", ok: true, "rev": "2-(random)"}

// Update an existing document, merging new content into existing value.
db.update({_id: "testing123", flip: true})
    .subscribe(result => console.log(result));
    // -> {"id": "testing123", ok: true, "rev": "3-(random)"}

// Get the current value of an existing document.
// http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
db.get("testing123")
  .subscribe(result => console.log(result));
  // -> {"_id": "testing123", "_rev": "3-(random)", "foo": "baz", "flip": true}

// Get the value of an existing document with query options.
// All options described under query parameters below are supported:
// http://docs.couchdb.org/en/latest/api/document/common.html#get--db-docid
db.get("testing123", {rev: "1-existingRevId"})
  .subscribe(result => console.log(result));
  // -> {"_id": "testing123", "_rev": "1-(random)", "foo": "baz"}

// Get information about several documents at once.
// All options described under query parameters below are supported:
// http://docs.couchdb.org/en/latest/api/database/bulk-api.html#get--db-_all_docs
db.allDocs({startkey: "testing123"})
  .subscribe(result => console.log(result));
  // -> {"offset": 0, "rows": {...}, "total_rows": 5}

// Delete an existing document. Both arguments (doc ID and rev ID) are required.
// http://docs.couchdb.org/en/latest/api/document/common.html#put--db-docid
db.delete("testing123", "3-latestRevId")
  .subscribe(result => console.log(result));
  // -> {"id": "testing123", ok: true, "rev": "4-(random)"}
```

If any HTTP errors occur, they will be reported via `onError` notification on
the Observable using the [HTTP error object from rx-fetch](https://github.com/tangledfruit/rx-fetch#http-error-object).

## License

MIT
