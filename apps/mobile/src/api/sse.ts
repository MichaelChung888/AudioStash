export interface SseMessage {
  event: string;
  data: string;
}

// Server-Sent Events arrive as text in arbitrary chunks. Each line is "field: value";
// a blank line ends a message. A chunk can end halfway through a line, or between
// the \r and \n of a line ending, so incomplete text is kept for the next chunk.
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
export function createSseParser() {
  let buffer = '';
  let event = '';
  let data: string[] = [];

  function takeLine(line: string, out: SseMessage[]) {
    if (line === '') {
      if (data.length > 0) out.push({ event: event || 'message', data: data.join('\n') });
      event = '';
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  return {
    push(chunk: string): SseMessage[] {
      buffer += chunk;
      const out: SseMessage[] = [];
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const char = buffer[i];
        if (char !== '\n' && char !== '\r') continue;
        // Wait for the next chunk: it may begin with the \n of this \r\n.
        if (char === '\r' && i === buffer.length - 1) break;
        takeLine(buffer.slice(start, i), out);
        if (char === '\r' && buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
      return out;
    },
  };
}
