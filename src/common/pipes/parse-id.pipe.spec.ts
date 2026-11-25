import { BadRequestException } from '@nestjs/common';
import { ParseIdPipe } from './parse-id.pipe';

describe('ParseIdPipe', () => {
  const pipe = new ParseIdPipe();

  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
  ])('accepts %s', (input, expected) => {
    expect(pipe.transform(input)).toBe(expected);
  });

  it.each(['0', '-1', '1.5', 'abc', '1e3', '', '2147483648', '99999999999'])('rejects %p with 400', (input) => {
    expect(() => pipe.transform(input)).toThrow(BadRequestException);
  });
});
