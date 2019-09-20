import mongodb from 'mongodb';
import mongoose from 'mongoose';

import { BucketFileDoc, BucketFileModel, createFileSchema, DEFAULT_BUCKET_NAME } from '../';
import g from './global';
import fixtures from './fixtures';

describe('BucketFileModel', () => {
  let Model: BucketFileModel;

  function getModel(): BucketFileModel {
    if (Model) { return Model; }
    Model = mongoose.model<BucketFileDoc>('File', createFileSchema()) as BucketFileModel;
    return Model;
  }

  it('should be able to create a schema without a db connection', () => {
    const schema = createFileSchema();
    expect(schema).toBeTruthy();
  });

  it('should be able to create a Model without a DB connection', () => {
    expect(getModel()).toBeTruthy();
  });

  it('should throw if attempting to write file without db connection', async () => {
    const M = getModel();
    const doc = new M();
    try {
      doc.write(fixtures.sample.stream());
      fail('should have thrown');
    } catch (err) {
      expect(err.message).toEqual('NotConnected');
      expect(err.code).toEqual(500);
    }
  });

  describe('mongoose connected', () => {
    const bucketName = 'mongoose';
    const FileModel = mongoose.model<BucketFileDoc>('MongooseFile', createFileSchema(bucketName)) as BucketFileModel;

    beforeAll(async () => {
      await mongoose.connect(g.__MONGO_URI__, {useNewUrlParser: true, useUnifiedTopology: true} as any);
    });

    afterAll(async () => {
      await mongoose.disconnect();
    });

    it('should use use correct bucket', () => {
      const b = FileModel.getBucket();
      expect(b.bucketName).toEqual(bucketName);
    });

    it('should be able to write a file from the model', async () => {
      const doc = await FileModel.write({filename: fixtures.sample.filename}, fixtures.sample.stream());
      expect(doc).toBeTruthy();
      expect(doc._id).toBeInstanceOf(mongodb.ObjectId);
      expect(doc.filename).toEqual(fixtures.sample.filename);
    });

    it('should be able to write a file from the document', async () => {
      const doc = new FileModel({filename: fixtures.sample.filename, contentType: 'text/plain'});
      await doc.write(fixtures.sample.stream());
      expect(doc.length).toBeGreaterThan(0);
      expect(doc.chunkSize).toBeGreaterThan(0);
    });

    it('should be able to read a file from the model', async () => {
      const doc = await FileModel.write({filename: fixtures.sample.filename}, fixtures.sample.stream());
      let buff = await FileModel.read({_id: doc._id});
      const contents = fixtures.sample.contents();
      expect(buff.toString()).toEqual(contents);
      buff = await FileModel.read({filename: doc.filename});
      expect(buff.toString()).toEqual(contents);
    });

    it('should be able to read a file from the doc', async () => {
      const doc = new FileModel({filename: fixtures.sample.filename, contentType: 'text/plain'});
      await doc.write(fixtures.sample.stream());
      const buff = await doc.read();
      expect(buff.toString()).toEqual(fixtures.sample.contents());
    });
  });
});
