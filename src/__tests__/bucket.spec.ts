import mongodb from 'mongodb';
import { GridFSBucket, DEFAULT_BUCKET_NAME, BucketFile } from '../';
import g from './global';
import fixtures from './fixtures';

describe('GridFSBucket', () => {
  /** static methods */
  ['create', 'createFromCollection'].forEach(
    (fnName) => it(`should have static method ${fnName}`, () => {
      expect(GridFSBucket).toHaveProperty(fnName);
      const prop = (GridFSBucket as any)[fnName];
      expect(typeof prop).toEqual('function');
    })
  );

  describe('instance tests', () => {
    let mongoClient: mongodb.MongoClient;
    let db: mongodb.Db;
    let defaultBucket: GridFSBucket;

    beforeAll(async () => {
      mongoClient = await mongodb.connect(g.__MONGO_URI__, {
        useNewUrlParser: true, useUnifiedTopology: true,
      });
      db = mongoClient.db(g.__MONGO_DB_NAME__);
      defaultBucket = new GridFSBucket(db);
    });

    afterAll(async () => {
      await mongoClient.close();
    });

    function writeSampleFile(): Promise<BucketFile> {
      const stream = fixtures.sample.stream();
      return defaultBucket.writeFile({filename: fixtures.sample.filename}, stream);
    }

    it('should be able to create an instance', () => {
      expect(defaultBucket.bucketName).toEqual(DEFAULT_BUCKET_NAME);
    });

    it('should be able to create instance using create method', () => {
      const bucket = GridFSBucket.create(db);
      expect(bucket.bucketName).toEqual(DEFAULT_BUCKET_NAME);
    });

    it('should be able to specify bucketName', () => {
      const bucketName = 'tests';
      const b = GridFSBucket.create(db, {bucketName});
      expect(b.bucketName).toEqual(bucketName);
    });

    it('should have be instance of mongodb.GridFSBucket', () => {
      expect(defaultBucket instanceof mongodb.GridFSBucket).toEqual(true);
    });

    it('should reference correct collection', () => {
      const bucketName = 'attachments';
      const b = new GridFSBucket(db, {bucketName});
      const collectionName = `${bucketName}.files`;
      expect(b.collectionName).toEqual(collectionName);
    });

    /** check instance methods exist */
    [
      'createReadStream', 'createWriteStream',
      'deleteByFilename', 'deleteById', 'unlink',
      'findById', 'findOne',
      'readFile', 'writeFile',
    ].forEach((fnName) => {
      it(`should have ${fnName} method`, () => {
        const prop = (defaultBucket as any)[fnName];
        expect(defaultBucket).toHaveProperty(fnName);
        expect(typeof prop).toEqual('function');
      });
    });

    it('should be able to write a file', async () => {
      const file = await writeSampleFile();
      expect(file).toBeTruthy();
      expect(file._id).toBeTruthy();
    });

    it('should be able to write a buffer', async () => {
      const data = Buffer.from(fixtures.sample.contents());
      const file = await defaultBucket.writeFile({filename: fixtures.sample.filename}, data);
      expect(file).toBeTruthy();
      expect(file._id).toBeTruthy();
    });

    it('should be able to read a file', async () => {
      await writeSampleFile();
      const buff = await defaultBucket.readFile({filename: fixtures.sample.filename});
      expect(buff).toBeTruthy();
      expect(buff.length).toBeGreaterThan(0);
      expect(buff.toString()).toEqual(fixtures.sample.contents());
    });

    it('should be able to get a read stream', async () => {
      await writeSampleFile();
      const stream = defaultBucket.createReadStream({filename: fixtures.sample.filename});
      expect(typeof stream.on).toEqual('function');
      expect(typeof stream.read).toEqual('function');
    });

    it('should be able to create a write stream', async () => {
      const stream = defaultBucket.createWriteStream({filename: fixtures.sample.filename});
      expect(typeof stream.on).toEqual('function');
      expect(typeof stream.write).toEqual('function');
    });

    it('should be able to use findOne method to find a file', async () => {
      const written = await writeSampleFile();
      const file = await defaultBucket.findOne({filename: written.filename}, {sort: {filename: 1, uploadDate: -1}});
      expect(file).toBeTruthy();
      expect(file).not.toBeNull();
      expect(file && file._id.toHexString()).toEqual(written._id.toHexString());
    });

    it('should be able to use findById to find a file', async () => {
      const written = await writeSampleFile();
      const file = await defaultBucket.findById(written._id);
      expect(file && file._id.toHexString()).toEqual(written._id.toHexString());
    });

    it('should delete file', async () => {
      const file = await writeSampleFile();
      const deletedId = await defaultBucket.deleteById(file._id);
      expect(deletedId.toHexString()).toEqual(file._id.toHexString());
    });

    it('should delete multiple files', async () => {
      const file1 = await writeSampleFile();
      const file2 = await writeSampleFile();
      const findOpts: mongodb.GridFSBucketFindOptions = {
        limit: 2,
        sort: {filename: 1, uploadDate: -1},
      };
      const ids = [file1._id, file2._id];
      const deletedIds = await defaultBucket.deleteByFilename(file1.filename, findOpts);
      expect(deletedIds.length).toEqual(ids.length);
      deletedIds.forEach((id) =>
        expect(ids.some((e) => e.toHexString() === id.toHexString()))
      );
    });
  });
});
