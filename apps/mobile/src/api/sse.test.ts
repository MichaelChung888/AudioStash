import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse.ts';

describe('createSseParser', () => {
  it('reads named events', () => {
    const parser = createSseParser();
    expect(parser.push('event: library.changed\ndata: {"cursor":4}\n\n')).toEqual([{ event: 'library.changed', data: '{"cursor":4}' }]);
  });

  it('joins a message split across chunks', () => {
    const parser = createSseParser();
    expect(parser.push('event: worker.sta')).toEqual([]);
    expect(parser.push('tus\ndata: {"online":')).toEqual([]);
    expect(parser.push('true}\n\n')).toEqual([{ event: 'worker.status', data: '{"online":true}' }]);
  });

  it('handles a \\r\\n line ending split between chunks', () => {
    const parser = createSseParser();
    expect(parser.push('data: a\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{ event: 'message', data: 'a' }]);
  });

  it('joins several data lines with newlines and skips comments', () => {
    const parser = createSseParser();
    expect(parser.push(': keepalive\ndata: one\ndata: two\n\n')).toEqual([{ event: 'message', data: 'one\ntwo' }]);
  });

  it('returns several messages from one chunk', () => {
    const parser = createSseParser();
    const messages = parser.push('event: ping\ndata: \n\nevent: a\ndata: 1\n\n');
    expect(messages).toEqual([
      { event: 'ping', data: '' },
      { event: 'a', data: '1' },
    ]);
  });

  it('drops a message with no data', () => {
    const parser = createSseParser();
    expect(parser.push('event: nothing\n\n')).toEqual([]);
  });
});
