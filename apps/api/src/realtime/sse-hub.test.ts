import type { ClientEvent } from '@audiostash/contracts';
import { describe, expect, it, vi } from 'vitest';
import { SseHub } from './sse-hub.ts';

const event: ClientEvent = { type: 'library.changed', cursor: 7 };
const subscriber = (sessionId = 'sess_a') => ({ sessionId, send: vi.fn(), close: vi.fn() });

describe('SseHub', () => {
  it('sends to every subscriber until they unsubscribe', () => {
    const hub = new SseHub();
    const a = subscriber();
    const b = subscriber();
    const unsubscribeA = hub.subscribe(a);
    hub.subscribe(b);

    hub.broadcast(event);
    unsubscribeA();
    hub.broadcast(event);

    expect(a.send).toHaveBeenCalledOnce();
    expect(b.send).toHaveBeenCalledTimes(2);
    expect(hub.size).toBe(1);
  });

  it('closes and forgets every subscriber on closeAll', () => {
    const hub = new SseHub();
    const a = subscriber();
    hub.subscribe(a);

    hub.closeAll();

    expect(a.close).toHaveBeenCalledOnce();
    expect(hub.size).toBe(0);
  });

  it('closes only the streams of a revoked session', () => {
    const hub = new SseHub();
    const revoked = subscriber('sess_old');
    const other = subscriber('sess_new');
    hub.subscribe(revoked);
    hub.subscribe(other);

    hub.closeSession('sess_old');
    hub.broadcast(event);

    expect(revoked.close).toHaveBeenCalledOnce();
    expect(revoked.send).not.toHaveBeenCalled();
    expect(other.close).not.toHaveBeenCalled();
    expect(other.send).toHaveBeenCalledOnce();
    expect(hub.size).toBe(1);
  });
});
