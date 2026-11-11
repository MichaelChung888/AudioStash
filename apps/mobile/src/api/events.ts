import { type ClientEvent, clientEventSchema } from '@pluck/contracts';
import { fetch } from 'expo/fetch';
import { config } from '../config.ts';
import { getSessionToken } from './client.ts';
import { createSseParser } from './sse.ts';

// The server pings every 25 seconds. Silence for longer than this means the
// connection died without closing, which mobile networks do often.
const SILENCE_LIMIT_MS = 60_000;
const MAX_RETRY_DELAY_MS = 30_000;

interface Handlers {
  onEvent: (event: ClientEvent) => void;
  // Called on every successful (re)connect. Events sent while disconnected are
  // never replayed, so the app reloads whatever it shows.
  onOpen: () => void;
}

// Keeps one GET /v1/events stream open, reconnecting with backoff. Returns a function that closes it.
// React Native's built-in fetch cannot stream a response body; expo/fetch can.
export function openEventStream({ onEvent, onOpen }: Handlers): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;

  async function connect() {
    controller = new AbortController();
    const { signal } = controller;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => controller?.abort(), SILENCE_LIMIT_MS);
    };

    try {
      const token = await getSessionToken();
      resetSilenceTimer();
      const response = await fetch(`${config.apiUrl}/v1/events`, { headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' }, signal });
      if (!response.ok || !response.body) throw new Error(`Event stream answered ${response.status}`);

      failures = 0;
      onOpen();
      const parser = createSseParser();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resetSilenceTimer();
        for (const message of parser.push(value)) {
          if (message.event === 'ping') continue;
          const parsed = clientEventSchema.safeParse(safeJson(message.data));
          if (parsed.success) onEvent(parsed.data);
        }
      }
    } catch {
      // Network loss, a 401 after sign-out, or the silence timer. All end in a retry.
    } finally {
      if (silenceTimer) clearTimeout(silenceTimer);
    }

    if (stopped) return;
    failures += 1;
    // 1 s, 2 s, 4 s ... up to 30 s, with jitter so many phones do not reconnect in step.
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** (failures - 1)) * (0.5 + Math.random() / 2);
    retryTimer = setTimeout(connect, delay);
  }

  connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    controller?.abort();
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
