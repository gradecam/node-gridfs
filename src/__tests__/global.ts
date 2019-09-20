interface Global {
  __MONGO_URI__: string;
  __MONGO_DB_NAME__: string;
}

export const g: Global = global as any;

export default g;

describe('global', () => {
  it('should have __MONGO_DB_NAME__', () => {
    expect(g.__MONGO_DB_NAME__).toBeTruthy();
  });
  it('should have __MONGO_URI__', () => {
    expect(g.__MONGO_URI__).toBeTruthy();
  });
});
