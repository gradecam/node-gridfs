import mongodb from 'mongodb';
import mongoose from 'mongoose';
import {
  BucketFile,
  DEFAULT_BUCKET_NAME, GridFSBucket,
  ReadFileBaseOpts, ReadFileOpts,
  WriteFileOpts,
} from './bucket';

/**
 * Defines the shape of a `BucketFileDoc`
 */
export interface BucketFileDoc extends mongoose.Document, BucketFile {
  _id: any;
  updatedAt: Date;
  /**
   * Creates a `mongodb.GridFSBucketReadStream` to read the specific file chunks
   * associated with the file.
   * @param opts
   */
  createReadStream(opts?: ReadFileBaseOpts): mongodb.GridFSBucketReadStream;
  /**
   * Creates a `mongodb.GridFSBucketWriteStream` for writing a new revision of
   * `filename` to `GridFS`. The stream's `id` property contains the file's `_id`
   * within `GridFS`.
   */
  createWriteStream(): mongodb.GridFSBucketWriteStream;
  /**
   * Removes file and chunks from `GridFS`
   */
  deleteById(): Promise<mongodb.ObjectId>;
  /**
   * Returns a `GridFSBucket` for the document
   */
  getBucket(): GridFSBucket;
  /**
   * Read chunks from `GridFS` into a `Buffer`
   *
   * NOTE: Normally this is something you would only want to do with small files.
   */
  read(): Promise<Buffer>;
  /**
   * Removes file and chunks from `GridFS`
   */
  unlink(): Promise<mongodb.ObjectId>;
  /**
   * Writes contents of stream to `GridFS`
   * @param readableStream
   */
  write(readableStream: NodeJS.ReadableStream): Promise<BucketFileDoc>;
}

/**
 * Defines the shape of a `BucketFileModel`
 */
export interface BucketFileModel extends mongoose.Model<BucketFileDoc> {
  /**
   * Creates a `mongodb.GridFSBucketReadStream` to read a specific file's
   * chunks from `GridFS`.
   * @param opts
   */
  createReadStream(opts: ReadFileOpts): mongodb.GridFSBucketReadStream;
  /**
   * Creates a `mongodb.GridFSBucketWriteStream` for writing a file.
   * The stream's `id` property contains the file's `_id` within `GridFS`.
   * @param opts
   */
  createWriteStream(opts: WriteFileOpts): mongodb.GridFSBucketWriteStream;
  /**
   * Deletes a file and it's chunks
   * @param _id
   */
  deleteById(_id: mongodb.ObjectId): Promise<mongodb.ObjectId>;
  /**
   * Deletes files matching `filename` and their chunks
   * @param filename
   * @param opts
   */
  deleteByFilename(filename: string, opts: mongodb.GridFSBucketFindOptions): Promise<mongodb.ObjectId[]>;
  /**
   * Returns a `GridFSBucket` for the model
   */
  getBucket(): GridFSBucket;
  /**
   * Reads file from `GridFS` into a `Buffer`
   *
   * NOTE: Normally this is something you would only want to do with small files.
   * @param opts
   */
  read(opts: ReadFileOpts): Promise<Buffer>;
  /**
   * Writes the cont
   * @param file
   * @param readStream
   */
  write(file: Partial<BucketFile>, readStream: NodeJS.ReadableStream): Promise<BucketFileDoc>;
}

/**
 * Creates a schema that stores files and chunks in the specified bucket.
 * @param bucketName
 */
export function createFileSchema(bucketName?: string): mongoose.Schema<BucketFileDoc> {
  const collection = `${bucketName || DEFAULT_BUCKET_NAME}.files`;

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
  }, {collection, id: false, timestamps: {createdAt: 'uploadDate'}});

  schema.methods.createReadStream = function(this: BucketFileDoc, opts: ReadFileBaseOpts = {}): mongodb.GridFSBucketReadStream {
    return this.getBucket().createReadStream(Object.assign({_id: this._id, filename: this.filename}, opts));
  };

  schema.methods.createWriteStream = function(this: BucketFileDoc): mongodb.GridFSBucketWriteStream {
    const writeOpts: WriteFileOpts = {
      _id: this._id,
      aliases: this.aliases,
      chunkSizeBytes: this.chunkSize,
      contentType: this.contentType,
      filename: this.filename,
      metadata: this.metadata,
    };
    return this.getBucket().createWriteStream(writeOpts);
  };

  schema.methods.deleteById = function(this: BucketFileDoc): Promise<mongodb.ObjectId> {
    return this.getBucket().deleteById(this._id);
  };
  schema.methods.unlink = schema.methods.deleteById;

  schema.methods.getBucket = function(this: BucketFileDoc): GridFSBucket {
    return GridFSBucket.createFromCollection(this.collection, {bucketName});
  };

  schema.statics.getBucket = function(this: BucketFileModel): GridFSBucket {
    return GridFSBucket.createFromCollection(this.collection, {bucketName});
  }

  schema.methods.read = function(this: BucketFileDoc): Promise<Buffer> {
    return this.getBucket().readFile({_id: this._id});
  };

  schema.methods.write = function(this: BucketFileDoc, readStream: NodeJS.ReadableStream): Promise<BucketFileDoc> {
    const writeStream = this.createWriteStream();
    return new Promise<BucketFileDoc>((resolve, reject): void => {
      writeStream.on('error', reject);
      writeStream.on('finish', (file: BucketFile): void => {
        this.length = file.length;
        this.chunkSize = file.chunkSize;
        this.uploadDate = file.uploadDate;
        this.isNew = false;
        this.save()
          .then((d) => resolve(d))
          .catch(reject)
        ;
      });
      readStream.pipe(writeStream);
    });
  };

  schema.statics.createReadStream = function(this: BucketFileModel, opts: ReadFileOpts): mongodb.GridFSBucketReadStream {
    return this.getBucket().createReadStream(opts);
  };

  schema.statics.createWriteStream = function(this: BucketFileModel, opts: WriteFileOpts): mongodb.GridFSBucketWriteStream {
    return this.getBucket().createWriteStream(opts);
  };

  schema.statics.deleteById = function(this: BucketFileModel, _id: mongodb.ObjectId): Promise<mongodb.ObjectId> {
    return this.getBucket().deleteById(_id);
  }

  schema.statics.deleteByFilename = function(this: BucketFileModel, filename: string, opts: mongodb.GridFSBucketFindOptions): Promise<mongodb.ObjectId[]> {
    return this.getBucket().deleteByFilename(filename, opts);
  }

  schema.statics.read = function(this: BucketFileModel, opts: ReadFileOpts): Promise<Buffer> {
    return this.getBucket().readFile(opts);
  };

  schema.statics.write = function(this: BucketFileModel, file: Partial<BucketFile>, readStream: NodeJS.ReadableStream): Promise<BucketFileDoc> {
    const bucketFile = new this(file);
    return bucketFile.write(readStream);
  };

  return schema;
}
