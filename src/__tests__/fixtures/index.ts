import { resolve } from 'path';
import { createReadStream, readFileSync, ReadStream } from 'fs';

function getFixture(filename: string): Fixture {
  const path = resolve(__dirname, filename);
  return {
    filename,
    path,
    stream: () => createReadStream(path),
    contents: () => readFileSync(path).toString(),
  };
}

export const fixtures = {
  sample: getFixture('sample.txt'),
};

export interface Fixture {
  filename: string;
  path: string;
  stream(): ReadStream,
  contents(): string,
}

export default fixtures;

describe('fixtures', () => {
  it('should have sample', () => {
    expect(fixtures.sample).toBeTruthy();
  });
});
