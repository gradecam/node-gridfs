import mongodb from 'mongodb';
import mongoose from 'mongoose';
import { GridFSBucket, ReadFileOpts } from './bucket';

export type Fn = (doc: any) => string;
export type GFSBucketOpts = mongodb.GridFSBucketOptions;
export type GFSUploadOpts = mongodb.GridFSBucketOpenUploadStreamOptions

export interface PluginOpts {
  /**
   * Options, such as the `bucketName` to use when reading from/writing to
   * `GridFS`.
   */
  bucketOpts?: GFSBucketOpts;
  /**
   * Allows specifying name of bucket to be used when storing files
   * in `GridFS`.
   */
  bucketName?: string | Fn;
  /**
   * A string that specifies the property which references the `_id` of the
   * file within `GridFS`. When a file is written to `GridFS` this property
   * will be updated with the `_id` of the written file. If `_id` is specified
   * only one revision of * the file will ever be able to be stored within
   * `GridFS` since it will override the use of a `filename`.
   * @default string `'fileId'`
   */
  fileId?: string;
  /**
   * If `filename` is a string it specifies the property which contains
   * the filename to use for the file in `GridFS`. If a function is
   * provided the returned value will be used as the filename within
   * `GridFS`. A filename is required when storing a file in `GridFS`
   * if no filename property is identified a filename will be constructed
   * from the `_id` of the document.
   * @default string filename
   */
  filename?: string | Fn;
}

export interface ReadOpts {
  /** end before byte */
  end?: number;
  /**
   * revision number relative to the oldest file with a given filename.
   * 0 gets you the oldest file, 1 gets you the 2nd oldest, -1 gets you the newest.
   * (default: -1)
   * Only applicable if reading by filename instead of _id.
   */
  revision?: number;
  /** start at byte */
  start?: number;
}

export interface GridableDoc extends mongoose.Document {
  /** `_id` of the file in `GridFS` */
  fileId?: mongodb.ObjectId;
  /** `filename` of the file in `GridFS` */
  filename?: string;

  /**
   * Returns a `GridFSBucket` instance.
   */
  getBucket(): GridFSBucket;
  /**
   * Returns the filename used in `GridFS`.
   */
  getGridFSFilename(): string;
  /**
   * Creates a read stream to retrive file contents from `GridFS`.
   * @param opts
   */
  createReadStream(opts?: ReadOpts): mongodb.GridFSBucketReadStream;
  /**
   * Creates a writable stream to write to `GridFS`
   * @param opts
   */
  createWriteStream(opts?: GFSUploadOpts): mongodb.GridFSBucketWriteStream;
  /**
   * Reads file from `GridFS`.
   */
  read(): Promise<Buffer>;
  /**
   * Writes contents of `stream` to `GridFS`.
   */
  write(data: Buffer | NodeJS.ReadableStream, opts?: GFSUploadOpts): Promise<GridableDoc>;
}

/**
 * Returns the path where the `GridFS` file `_id` is stored if that path exists on the document's
 * schema; otherwise `''`.
 * @param doc a saveable document
 * @param opts
 */
export function getFileIdPath(doc: GridableDoc, opts: PluginOpts): string {
  const idPath = opts.fileId || 'fileId';
  if (doc.schema.path(idPath)) {
    return idPath;
  }
  return '';
}

/**
 * Returns the filename to use within `GridFS`.
 * @param doc
 * @param opts
 */
export function getFilename(doc: GridableDoc, opts: PluginOpts): string {
  if (typeof opts.filename === 'function') {
    return (opts.filename(doc) || '').trim();
  }
  const filenamePath: string = opts.filename || 'filename';

  if (doc.schema.path(filenamePath)) {
    return (doc.get(filenamePath) as string || '').trim();
  }
  return `${doc._id}.file`;
}

/**
 * Returns `ReadFileOpts` to use when reading a file from `GridFS`.
 * @param doc
 * @param pluginOpts
 * @param readOpts
 */
export function getReadFileOpts(doc: GridableDoc, pluginOpts: PluginOpts, readOpts: ReadOpts = {}): ReadFileOpts {
  if ('revision' in readOpts) {
    return Object.assign({filename: getFilename(doc, pluginOpts)}, readOpts);
  }
  const {end, start} = readOpts;
  const fileIdPath = getFileIdPath(doc, pluginOpts);
  if (fileIdPath && doc.get(fileIdPath)) {
    return {_id: doc.get(fileIdPath), end, start};
  }
  return {filename: getFilename(doc, pluginOpts), end, start};
}
