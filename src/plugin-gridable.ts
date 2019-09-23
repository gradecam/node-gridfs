import mongodb from 'mongodb';
import mongoose from 'mongoose';
import { GridFSBucket, writeData, WriteFileOpts } from './bucket';
import {
  GridableDoc, PluginOpts, ReadOpts,
  GFSUploadOpts, getReadFileOpts, getFileIdPath, getFilename,
} from './util-plugin';

export { PluginOpts, ReadOpts, GridableDoc, GFSUploadOpts };

/**
 * Add file read/write capability to an existing schema.
 * @param schema
 * @param pluginOpts
 */
export function pluginGridable(schema: mongoose.Schema<GridableDoc>, pluginOpts: PluginOpts = {}): void {
  const bucketOpts = Object.assign({}, pluginOpts.bucketOpts);
  pluginOpts = Object.assign({filename: 'filename'}, pluginOpts, {bucketOpts});

  schema.methods.getBucket = function(this: GridableDoc): GridFSBucket {
    const opts = Object.assign({}, pluginOpts.bucketOpts);
    if (pluginOpts.bucketName) {
      opts.bucketName = typeof pluginOpts.bucketName === 'string' ? pluginOpts.bucketName : pluginOpts.bucketName(this);
    }
    return GridFSBucket.createFromCollection(this.collection, opts);
  };

  schema.methods.createReadStream = function(this: GridableDoc, opts: ReadOpts = {}): mongodb.GridFSBucketReadStream {
    return this.getBucket().createReadStream(getReadFileOpts(this, pluginOpts, opts));
  };

  schema.methods.createWriteStream = function(this: GridableDoc, opts: GFSUploadOpts = {}): mongodb.GridFSBucketWriteStream {
    const filename = getFilename(this, pluginOpts);
    const writeOpts: WriteFileOpts = Object.assign({filename}, opts);
    if (pluginOpts.fileId === '_id') { writeOpts._id = this._id; }
    return this.getBucket().createWriteStream(writeOpts);
  };

  schema.methods.read = function(this: GridableDoc): Promise<Buffer> {
    return this.getBucket().readFile(getReadFileOpts(this, pluginOpts));
  }

  schema.methods.write = function(this: GridableDoc, data: Buffer | NodeJS.ReadableStream, opts: GFSUploadOpts = {}): Promise<GridableDoc> {
    const writeStream = this.createWriteStream(opts);
    return writeData(writeStream, data)
      .then((file) => {
        const fileIdPath = getFileIdPath(this, pluginOpts);
        if (fileIdPath !== '_id') { this.set(fileIdPath, file._id); }
        return this.save();
      })
    ;
  };
  schema.methods.getGridFSFilename = function(this: GridableDoc): string {
    return getFilename(this, pluginOpts);
  };
}
