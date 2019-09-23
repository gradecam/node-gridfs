interface Global {
  __MONGO_URI__: string;
  __MONGO_DB_NAME__: string;
}

export const g: Global = global as any;

export default g;
