import mongodb from 'mongodb';
import { Document, Collection, Model } from 'mongoose';

import { raiseInvalidCollection } from './error';
import { FileUploadCallback, MulterGridFSFile, Request } from './request';

const DEFAULT_BUCKET_NAME = 'fs';

/**
 * An enhanced version of the `mongodb.GridFSBucket` which makes
 * interacting with the bucket a little easier.
 */
export class GridFSBucket extends mongodb.GridFSBucket {
  /** name of the bucket */
  readonly bucketName: string;

  constructor(db: mongodb.Db, options: mongodb.GridFSBucketOptions = {}) {
    options.bucketName = options.bucketName || DEFAULT_BUCKET_NAME;
    super(db, options);
    this.bucketName = options.bucketName;
  }

  /**
   * Write a file to the bucket and return information on how to access the file.
   * @param req Incoming HTTP Request object
   * @param file Multer file
   * @param done Multer done callback
   */
  _handleFile(req: Request, file: MulterGridFSFile, done: FileUploadCallback): void {
    const stream = file.stream;
    const body = req.body || {};
    const aliases: string[] = body.aliases;
    const metadata = body.metadata;
    const fileOpts: WriteFileOpts = {
      _id: new mongodb.ObjectId(),
      filename: file.originalname,
      contentType: file.mimetype,
      aliases: aliases ? [...aliases] : aliases,
      metadata,
    };
    const bucketName = this.bucketName;
    this.writeFile(fileOpts, stream)
      .then((bucketFile) => {
        file._id = bucketFile._id;
        file.bucketName = bucketName;
        file.size = file.size || bucketFile.length;
        done(null, file);
      })
      .catch((err) => done(err, file))
    ;
  }

  /**
   * Removes an existing file from the bucket. (Happens if an error occurs.)
   * @param req Incoming HTTP Request object
   * @param file Multer file
   * @param done Multer done callback
   */
  _removeFile(req: Request, file: MulterGridFSFile, done: FileUploadCallback): void {
    if (!file._id) {
      return done(null);
    }
    this.deleteById(file._id)
      .then(() => done(null, file))
      .catch((err) => done(err))
    ;
  }

  /**
   * Create an instance of `GridFSBucket`.
   * @param db database connection
   * @param opts GridFS bucket configuration options
   */
  static create(db: mongodb.Db, opts: mongodb.GridFSBucketOptions = {}): GridFSBucket {
    const bucket = new GridFSBucket(db, opts);
    return bucket;
  }

  /**
   * Create an instance of `GridFSBucket` using the name of the collection as the
   * `bucketName`.
   * @param coll instance of `mongoose.Collection`
   * @param opts additional bucket options
   */
  static createFromCollection(coll: Collection, opts: CreateFromCollectionOpts = {}): GridFSBucket {
    const {bucketNameFromCollection, ...bucketOpts} = opts;
    if (bucketNameFromCollection) { bucketOpts.bucketName = coll.collectionName; }
    if (!('readPreference' in opts)) {
      bucketOpts.readPreference = mongodb.ReadPreference.PRIMARY_PREFERRED;
    }
    if (!(coll.conn && coll.conn.db)) {
      const err = new mongodb.MongoError('NotConnected');
      err.code = 500;
      err.errmsg = `No database connection for ${coll.collectionName}`;
      throw err;
    }
    return new GridFSBucket(coll.conn.db, bucketOpts);
  }

  /**
   * Returns the name of the collection used to store file detials for
   * items stored within GridFS.
   */
  get collectionName(): string {
    return `${this.bucketName}.files`;
  }

  /**
   * Creates a `mongodb.GridFSBucketReadStream`) for streaming the file with the
   * given `_id` or `filename` from GridFS. If there are multiple files with the
   * same name, this will stream the most recent file with the given name (as
   * determined by the `uploadDate` field). You can set the `revision` option
   * to change this behavior.
   * @param opts options used when initializing the `mongodb.GridFSBucketReadStream`
   */
  createReadStream(opts: ReadFileOpts): mongodb.GridFSBucketReadStream {
    // below the cast to `any` is due to incorrect types in `@types/mongodb`
    if ('_id' in opts && opts._id) {
      const { _id, ...byIdOpts } = opts;
      return this.openDownloadStream(_id, byIdOpts as any);
    }
    if ('filename' in opts && opts.filename) {
      const { filename, ...byFilenameOpts } = opts;
      return this.openDownloadStreamByName(filename, byFilenameOpts as any);
    }
    const err = new mongodb.MongoError('InvalidOptions');
    err.code = 400;
    err.errmsg = '_id or filename is required';
    throw err;
  }

  /**
   * Create a `mongodb.GridFSBucketWriteStream` for writing buffers to
   * `GridFS`. The stream's `id` property contains the file's `_id`
   * within `GridFS`.
   * @param opts
   */
  createWriteStream(opts: WriteFileOpts): mongodb.GridFSBucketWriteStream {
    const defaults = {_id: new mongodb.ObjectId()};
    const { _id, filename, ...options } = Object.assign({}, defaults, opts);
    if (!filename) {
      const err = new mongodb.MongoError('InvalidOptions');
      err.code = 400;
      err.errmsg = 'filename is required';
      throw err;
    }
    const writeStream = this.openUploadStreamWithId(_id, filename, options);
    return writeStream;
  }

  /**
   * Deletes files by `filename` from `GridFS`. Returns the `_id` of each
   * deleted file.
   * @param filename
   */
  async deleteByFilename(filename: string, opts: mongodb.GridFSBucketFindOptions = {}): Promise<mongodb.ObjectId[]> {
    const cursor: mongodb.Cursor<BucketFile> = this.find({filename}, opts);
    if (!cursor) { raiseInvalidCollection(this.collectionName); }
    let file: BucketFile | null;
    const deleted: mongodb.ObjectId[] = [];
    while ((file = await cursor.next())) {
      deleted.push(await this.deleteById(file._id));
    }
    return deleted;
  }

  /**
   * Deletes a file from `GridFS` including all related chunks.
   * @param _id
   */
  deleteById(_id: mongodb.ObjectID): Promise<mongodb.ObjectId> {
    return new Promise<mongodb.ObjectId>((resolve, reject): void =>
      this.delete(_id, (err) => err ? reject(err) : resolve(_id))
    );
  }

  /**
   * Find file by `_id`
   * @param _id
   * @param opts
   */
  async findById(_id: mongodb.ObjectId, opts: mongodb.GridFSBucketFindOptions = {}): Promise<BucketFile | null> {
    return this.findOne({_id}, opts);
  }

  /**
   * Find a single file.
   * @param query
   * @param opts
   */
  async findOne(query: any, opts: mongodb.GridFSBucketFindOptions = {}): Promise<BucketFile | null> {
    opts.limit = 1;
    const cursor: mongodb.Cursor<BucketFile | null> = this.find(query, opts);
    if (!cursor) { raiseInvalidCollection(this.collectionName) }
    return cursor.next();
  }

  /** alias to `deleteById` */
  unlink(_id: mongodb.ObjectId): Promise<mongodb.ObjectId> { return this.deleteById(_id); }

  /**
   * Writes the contents of `readStream` into `GridFS`.
   * @param opts
   * @param readStream
   */
  writeFile(opts: WriteFileOpts, readStream: NodeJS.ReadableStream): Promise<BucketFile> {
    const writeStream = this.createWriteStream(opts);
    return new Promise<BucketFile>((resolve, reject): void => {
      writeStream.on('error', reject);
      writeStream.on('finish', (file: BucketFile) => setTimeout(() => resolve(file), 0));
      readStream.pipe(writeStream);
    });
  }

  /**
   * Reads a file from `GridFS`
   * @param opts
   */
  readFile(opts: ReadFileOpts): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject): void => {
      try {
        const stream = this.createReadStream(opts);
        setTimeout((): void => resolve(stream.read()), 0);
      } catch (err) {
        reject(err);
      }
    });
  }
}

/**
 * All documents within the `files` collection of a bucket will
 * follow this format.
 */
export interface BucketFile {
  /** unique id of the file */
  _id: mongodb.ObjectId;
  /** filename of the file */
  filename: string;
  /** filesize in bytes */
  length: number;
  /** size of each chunk */
  chunkSize: number;
  /** any additional metadata associated with the file */
  metadata: {[key: string]: any};
  /** timestamp of when the file was uploaded into `GridFS` */
  uploadDate: Date;
  /** (deprecated) filename aliases */
  aliases?: string[];
  /** (deprecated) mimetype of the file */
  contentType?: string;
  /** (deprecated) MD5 hash of the file */
  md5?: string;
}

export interface CreateFromCollectionOpts extends mongodb.GridFSBucketOptions {
  bucketNameFromCollection?: boolean;
}

/**
 * Options common to reading by `_id` or by `filename`
 */
export interface ReadFileBaseOpts {
  /** 0-based offset in bytes to start */
  start?: number;
  /** 0-based offset in bytes to stop */
  end?: number;
}

/**
 * Read by the file's `_id`
 */
export interface ReadFileByIdOpts extends ReadFileBaseOpts {
  /** `_id` of file within `GridFS` */
  _id: mongodb.ObjectId;
}

/**
 * Read by file's `filename`
 */
export interface ReadFileByFilenameOpts extends ReadFileBaseOpts {
  /** `filename` as stored within `GridFS` */
  filename: string;
  /**
   * revision number relative to the oldest file with the given filename.
   * 0 gets you the oldest file, 1 gets you the 2nd oldest, -1 gets you the newest.
   * (default: -1)
   */
  revision?: number;
}

/**
 * Read file options
 */
export type ReadFileOpts = ReadFileByIdOpts | ReadFileByFilenameOpts;

/**
 * Write file options
 */
export interface WriteFileOpts extends mongodb.GridFSBucketOpenUploadStreamOptions {
  /**
   * `filename` as stored within `GridFS`
   */
  filename: string;
  /**
   * `_id` of the file in `GridFS`
   */
  _id?: mongodb.ObjectId;
}

/**
 * Defines the shape of a `BucketFileDoc`
 */
export interface BucketFileDoc extends Document, BucketFile {
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
   * Read chunks from `GridFS` into a `Buffer`
   */
  read(): Promise<Buffer>;
  /**
   * Removes file and chunks from `GridFS`
   */
  unlink(): Promise<mongodb.ObjectId>;
  write(readableStream: NodeJS.ReadableStream): Promise<BucketFile>;
}

/**
 * Defines the shape of a `BucketFileModel`
 */
export interface BucketFileModel extends Model<BucketFileDoc> {
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
  read(opts: ReadFileOpts): Promise<Buffer>;
  write(file: BucketFile, readStream: NodeJS.ReadableStream): Promise<BucketFile>;
}
