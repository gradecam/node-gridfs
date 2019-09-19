import mongodb from 'mongodb';

export type FileUploadCallback = (err: any, file?: MulterGridFSFile) => void;

export interface MulterGridFSFile {
  /** `GridFS` file id */
  _id: mongodb.ObjectId;
  /** `GridFS` bucket name */
  bucketName: string;
  /** Encoding type of the file */
  encoding: string;
  /** Field name specified in the form */
  fieldname: string;
  /** Mime type of the file */
  mimetype: string;
  /** Name of the file on the user's computer */
  originalname: string;
  /** Size of the file in bytes */
  size: number;
  /** readable stream of file contents */
  stream: NodeJS.ReadableStream;
}

export interface Request {
  body: any;
  file: MulterGridFSFile;
}
