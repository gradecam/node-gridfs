import mongoose from 'mongoose';

import fixtures from './fixtures';
import g from './global';

import { GridableDoc, pluginGridable } from '../plugin-gridable';
import { DEFAULT_BUCKET_NAME } from '../bucket';
import { MongoError } from 'mongodb';

const bucketOpts = {bucketName: 'saveable'};

describe('pluginGridable', () => {
  let conn: mongoose.Connection;
  let FileIdModel: mongoose.Model<GridableDoc>;
  let GridFileIdModel: mongoose.Model<GridFileIdDoc>;
  const filename = fixtures.sample.filename;

  beforeAll(async () => {
    conn = await mongoose.createConnection(g.__MONGO_URI__, {useNewUrlParser: true, useUnifiedTopology: true} as any);
    const fileIdSchema = new mongoose.Schema({
      fileId: {type: mongoose.Types.ObjectId},
      filename: {type: String},
    });
    fileIdSchema.plugin(pluginGridable, {bucketOpts});
    FileIdModel = conn.model<GridableDoc>('FileId', fileIdSchema);
    const gridFileIdSchema = new mongoose.Schema({
      gridFileId: {type: mongoose.Types.ObjectId},
    });
    gridFileIdSchema.plugin(pluginGridable, {bucketOpts, fileId: 'gridFileId'});
    GridFileIdModel = conn.model<GridableDoc>('GridFileId', gridFileIdSchema) as mongoose.Model<GridFileIdDoc>;
  });

  afterAll(async () => {
    await conn.close();
  });

  it('should be able to write a buffer', async () => {
    const doc = new FileIdModel({filename});
    const data = Buffer.from(fixtures.sample.contents());
    await doc.write(data);
    expect((await doc.read()).toString()).toEqual(data.toString());
    expect(data.toString().length).toBeGreaterThan(0);
  });

  describe('bucket name', () => {
    it('should have specifed bucket name', () => {
      const doc = new FileIdModel();
      expect(doc.getBucket().bucketName).toEqual(bucketOpts.bucketName);
    });
    it('should be possible to have dynamic bucket name', () => {
      interface DynamicBucketDoc extends GridableDoc {
        type: string;
      }
      const schema = new mongoose.Schema<DynamicBucketDoc>({
        type: {type: String},
      });
      const bucketName = (doc: any): string => {
        return doc.type;
      };
      schema.plugin(pluginGridable, {bucketName});
      const Model = conn.model<DynamicBucketDoc>('DynamicBucket', schema);
      const doc = new Model();
      expect(doc.type).toBeUndefined();
      expect(doc.getBucket().bucketName).toEqual(DEFAULT_BUCKET_NAME);
      doc.type = 'image';
      expect(doc.getBucket().bucketName).toEqual('image');
    });
  });

  describe('fileId', () => {
    it('should update on write', async () => {
      const doc = new FileIdModel({filename: fixtures.sample.filename});
      expect(doc.fileId).toBeFalsy();
      await doc.write(fixtures.sample.stream());
      expect(doc.fileId).toBeTruthy();
    });

    it('should be able to specify path as a string', async () => {
      const doc = new GridFileIdModel();
      expect(doc.gridFileId).toBeFalsy();
      await doc.write(fixtures.sample.stream());
      expect(doc.gridFileId).toBeTruthy();
    });

    it('should not be possible to write mutiple times if fileId == _id', async () => {
      const schema = new mongoose.Schema();
      schema.plugin(pluginGridable, {bucketOpts, fileId: '_id'});
      const Model = conn.model<GridableDoc>('IdFile', schema);
      const doc = new Model();
      await doc.write(fixtures.sample.stream());
      expect(doc.getGridFSFilename()).toEqual(`${doc._id}.file`);
      try {
        await doc.write(fixtures.sample.stream());
        fail(`should have thrown MongoError for duplicate key`);
      } catch (err) {
        const e: MongoError = err;
        expect(e.name).toEqual('MongoError');
        expect(e.code).toEqual(11000);
        expect(e.message.startsWith('E11000 duplicate key error dup key')).toBeTruthy();
        expect(e.message.indexOf(`${doc._id}`)).toBeGreaterThan(-1);
      }
    });
  });


  describe('filename', () => {
    it('should not override filename if specified path is present', () => {
      const doc = new FileIdModel();
      expect(doc._id).toBeTruthy();
      expect(doc.getGridFSFilename()).toEqual('');
    });

    it('should return specified filename', () => {
      const doc = new FileIdModel({filename});
      expect(doc.filename).toEqual(filename);
      expect(doc.getGridFSFilename()).toEqual(filename);
    });

    it('should throw InvalidOptions if filename is blank', async () => {
      try {
        const doc = new FileIdModel();
        await doc.write(fixtures.sample.stream());
        fail('should have thrown `InvalidOptions`');
      } catch (err) {
        expect(err.message).toEqual('InvalidOptions');
        expect(err.code).toEqual(400);
      }
    });

    it('should use id based filename', async () => {
      const doc = new GridFileIdModel();
      expect(doc.gridFileId).toBeFalsy();
      expect(doc._id).toBeTruthy();
      expect(doc.getGridFSFilename()).toEqual(`${doc._id}.file`);
    });

    it('should be able to specify a function for the filename', () => {
      const schema = new mongoose.Schema();
      schema.plugin(pluginGridable, {bucketOpts, filename: (doc: GridableDoc) => `${doc._id}.import`});
      const Model = conn.model<GridableDoc>('FilenameFunc', schema);
      const doc = new Model();
      expect(doc.getGridFSFilename()).toEqual(`${doc._id}.import`);
    });

    it('should be able to specify filename property', () => {
      const schema = new mongoose.Schema({
        gridFilename: {type: String},
      });
      schema.plugin(pluginGridable, {bucketOpts, filename: 'gridFilename'});
      const Model = conn.model<GridableDoc & {gridFilename: string}>('FilenameProp', schema);
      const doc = new Model({gridFilename: filename});
      expect(doc.gridFilename).toEqual(filename);
      expect(doc.getGridFSFilename()).toEqual(filename);
    });
  });
});

export interface GridFileIdDoc extends GridableDoc {
  gridFileId: mongoose.Types.ObjectId;
}
