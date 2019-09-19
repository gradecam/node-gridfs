import mongodb from 'mongodb';

/**
 * Raises an invalid collection error
 * @param collectionName
 */
export function raiseInvalidCollection(collectionName: string): never {
  const err = new mongodb.MongoError('InvalidCollection');
  err.code = 500;
  err.errmsg = `Collection ${collectionName} not found`;
  throw err;
}
