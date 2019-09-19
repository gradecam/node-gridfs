import mongodb from 'mongodb';
import mongoose from 'mongoose';
import {
  BucketFile, BucketFileDoc, BucketFileModel,
  GridFSBucket,
  ReadFileBaseOpts, ReadFileOpts,
  WriteFileOpts,
} from './bucket';

/**
 * Creates a schema that stores files and chunks in the specified bucket.
 * @param bucketName
 */
export function createFileSchema(bucketName?: string): mongoose.Schema<BucketFileDoc> {

  /**
   * Creates a `GridFSBucket` from the Document/Model connected to `bucketName`
   * @param obj mongoose `Document` or `Model` reference
   */
  function createBucket(obj: BucketFileDoc | BucketFileModel): GridFSBucket {
    return GridFSBucket.createFromCollection(obj.collection, {bucketName});
  }

  const schema = new mongoose.Schema<BucketFileDoc>({
    chunkSize: {type: Number},
    filename: {type: String, required: true},
    length: {type: Number},
    metadata: {type: mongoose.SchemaTypes.Mixed},
    uploadDate: {type: Date},
    /** deprecated properties (still present in MongoDB 4.0.x) */
    aliases: {type: [String]},
    contentType: {type: String},
    md5: {type: String},
  }, {timestamps: {createdAt: 'uploadDate'}});

  schema.methods.createReadStream = function(this: BucketFileDoc, opts: ReadFileBaseOpts = {}): mongodb.GridFSBucketReadStream {
    const bucket = createBucket(this);
    return bucket.createReadStream(Object.assign({_id: this._id, filename: this.filename}, opts));
  };

  schema.methods.createWriteStream = function(this: BucketFileDoc): mongodb.GridFSBucketWriteStream {
    const bucket = createBucket(this);
    const writeOpts: WriteFileOpts = {
      aliases: this.aliases,
      chunkSizeBytes: this.chunkSize,
      contentType: this.contentType,
      filename: this.filename,
      metadata: this.metadata,
    };
    return bucket.createWriteStream(writeOpts);
  };

  schema.methods.deleteById = function(this: BucketFileDoc): Promise<mongodb.ObjectId> {
    const bucket = createBucket(this);
    return bucket.deleteById(this._id);
  };
  schema.methods.unlink = schema.methods.deleteById;

  schema.methods.read = function(this: BucketFileDoc): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject): void => {
      try {
        const readStream = this.createReadStream();
        setTimeout((): void => resolve(readStream.read()), 0);
      } catch (err) {
        reject(err);
      }
    });
  };

  schema.methods.write = function(this: BucketFileDoc, readStream: NodeJS.ReadableStream): Promise<BucketFile> {
    const writeStream = this.createWriteStream();
    return new Promise<BucketFile>((resolve, reject): void => {
      writeStream.on('error', reject);
      writeStream.on('finish', (file: BucketFile): void => { setTimeout((): void => resolve(file), 0); });
      readStream.pipe(writeStream);
    });
  };

  schema.statics.createReadStream = function(this: BucketFileModel, opts: ReadFileOpts): mongodb.GridFSBucketReadStream {
    const bucket = createBucket(this);
    return bucket.createReadStream(opts);
  };

  schema.statics.createWriteStream = function(this: BucketFileModel, opts: WriteFileOpts): mongodb.GridFSBucketWriteStream {
    const bucket = createBucket(this);
    return bucket.createWriteStream(opts);
  };

  schema.statics.deleteById = function(this: BucketFileModel, _id: mongodb.ObjectId): Promise<mongodb.ObjectId> {
    const bucket = createBucket(this);
    return bucket.deleteById(_id);
  }

  schema.statics.deleteByFilename = function(this: BucketFileModel, filename: string, opts: mongodb.GridFSBucketFindOptions): Promise<mongodb.ObjectId[]> {
    const bucket = createBucket(this);
    return bucket.deleteByFilename(filename, opts);
  }

  schema.statics.read = function(this: BucketFileModel, opts: ReadFileOpts): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject): void => {
      try {
        const readStream = this.createReadStream(opts);
        setTimeout(() => resolve(readStream.read()), 0);
      } catch (err) {
        reject(err);
      }
    });
  };

  schema.statics.write = function(this: BucketFileModel, file: BucketFile, readStream: NodeJS.ReadableStream): Promise<BucketFile> {
    const bucketFile = new this(file);
    return bucketFile.write(readStream);
  };

  return schema;
}
