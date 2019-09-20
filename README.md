@gradecam/gridfs
================

Makes working with GridFS just a little bit easier.

## Installation
```sh
$ npm install --save @gradecam/gridfs
```

## Usage

### Direct usage of GridFSBucket
```ts
import { createReadStream } from 'fs';

import mongodb from 'mongodb';
import { GridFSBucket, WriteFileOpts } from '@gradecam/gridfs';

async function main() {
  const client = await mongodb.connect('mongodb://localhost/gcgfs', {useNewUrlParser: true});
  const db = client.db();
  const bucket = new GridFSBucket(db);
  // write file to gridfs
  const readStream = createReadStream('sample.txt');
  const options: WriteFileOpts = { filename: 'sample.txt', contentType: 'text/plain' };
  const file = await bucket.writeFile(options, readStream);
  if (file) {
    const fileBuff = await bucket.readFile({_id: file._id});
    // ... do something with fileBuff
  }
  client.close();
}
```

### Usage with mongoose
```ts
import { createReadStream } from 'fs';

import mongoose from 'mongoose';
import { BucketFile, createFileSchema } from '@gradecam/gridfs';

async function main() {
  await mongoose.connect('mongodb://localhost/gcgfs', {useNewUrlParser: true});
  const schema = createFileSchema('attachments');
  const AttachmentFile = mongoose.model('AttachmentFile', schema);
  // write file to gridfs
  const readStream = createReadStream('sample.txt');
  const fileOpts: Partial<BucketFile> = { filename: 'sample.txt', contentType: 'text/plain' };
  const doc = await AttachmentFile.write(fileOpts, readStream);
  const fileBuff = await doc.read();
  // ... do something with fileBuff
  mongoose.disconnect();
}
```

## Credits

Package was inspired by [mongoose-gridfs](https://github.com/lykmapipo/mongoose-gridfs)

Notable changes from `mongoose-gridfs` include:

* Package dependencies kept to a minimum
* Can define Mongoose Schema and Model's without having an established connection
* First class TypeScript support
