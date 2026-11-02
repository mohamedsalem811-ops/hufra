import { ApiError } from '@/api/client';

import { SubmitError } from '../report/submit';
import { classifyFailure, createOutboxProcessor, newOutboxItem } from './processor';
import { memoryOutbox, type OutboxItem } from './store';

const input = { lat: 32.89, lng: 13.19, severity: 'medium' as const, client_report_uuid: 'u-1' };
const photo = { uri: 'file:///documents/outbox/u/photo-1.jpg', width: 1280, height: 960 };
const item = (uuid: string, minute: number): OutboxItem =>
  newOutboxItem(uuid, { ...input, client_report_uuid: uuid }, [photo], { reportId: null, uploadToken: null, uploaded: 0 }, new Date(Date.UTC(2026, 10, 2, 10, minute)));
const fail = (error: unknown, state = { reportId: null, uploadToken: null, uploaded: 0 }) => new SubmitError(error, state);

describe('classifyFailure', () => {
  const noReport = { reportId: null, uploadToken: null, uploaded: 0 };
  const created = { reportId: 9, uploadToken: 'tok', uploaded: 1 };

  it('waits for the next chance on connection, timeout, busy server or no session', () => {
    expect(classifyFailure(fail(new ApiError('network', 'x')), noReport)).toBe('later');
    expect(classifyFailure(fail(new ApiError('timeout', 'x')), noReport)).toBe('later');
    expect(classifyFailure(fail(new ApiError('http', 'x', 503)), noReport)).toBe('later');
    expect(classifyFailure(fail(new ApiError('http', 'x', 429)), noReport)).toBe('later');
    expect(classifyFailure(fail(new ApiError('unauthorized', 'x', 401)), noReport)).toBe('later');
  });

  it('asks for a fresh upload permit when photos are refused after the report exists', () => {
    expect(classifyFailure(fail(new ApiError('http', 'x', 403), created), created)).toBe('permit');
  });

  it('gives up on a report the server refuses', () => {
    expect(classifyFailure(fail(new ApiError('http', 'x', 400)), noReport)).toBe('failed');
    expect(classifyFailure(fail(new ApiError('invalid_response', 'x', 200)), noReport)).toBe('failed');
  });
});

describe('outbox processor', () => {
  it('sends waiting reports oldest first and cleans up after each', async () => {
    const store = memoryOutbox([item('b', 2), item('a', 1)]);
    const sentOrder: string[] = [];
    const deleteFiles = jest.fn();
    const processor = createOutboxProcessor({
      store,
      send: async (i) => {
        sentOrder.push(i.uuid);
        return { reportId: 100 };
      },
      deleteFiles,
    });
    await expect(processor.flush()).resolves.toBe(2);
    expect(sentOrder).toEqual(['a', 'b']);
    expect(deleteFiles).toHaveBeenCalledTimes(2);
    await expect(store.list()).resolves.toEqual([]);
  });

  it('stops at the first connection problem and keeps progress for the retry', async () => {
    const store = memoryOutbox([item('a', 1), item('b', 2)]);
    const send = jest.fn(async () => {
      throw fail(new ApiError('network', 'offline'), { reportId: 7, uploadToken: 'tok', uploaded: 1 });
    });
    const processor = createOutboxProcessor({ store, send, deleteFiles: jest.fn() });
    await expect(processor.flush()).resolves.toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    const [a, b] = await store.list();
    expect(a).toMatchObject({ uuid: 'a', status: 'pending', attempts: 1, state: { reportId: 7, uploadToken: 'tok', uploaded: 1 } });
    expect(b.attempts).toBe(0);
  });

  it('drops an expired permit so the next try asks for a fresh one, then carries on', async () => {
    const store = memoryOutbox([item('a', 1), item('b', 2)]);
    const send = jest
      .fn()
      .mockRejectedValueOnce(fail(new ApiError('http', 'expired', 403), { reportId: 7, uploadToken: 'old', uploaded: 1 }))
      .mockResolvedValueOnce({ reportId: 8 });
    const processor = createOutboxProcessor({ store, send, deleteFiles: jest.fn() });
    await processor.flush();
    const [a] = await store.list();
    expect(a.state).toEqual({ reportId: 7, uploadToken: null, uploaded: 1 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('marks a refused report as failed with the server reason, and skips it later', async () => {
    const store = memoryOutbox([item('a', 1)]);
    const send = jest.fn(async () => {
      throw fail(new ApiError('http', 'bad', 400, { en: 'Invalid input', ar: 'بيانات غير صحيحة' }));
    });
    const processor = createOutboxProcessor({ store, send, deleteFiles: jest.fn() });
    await processor.flush();
    expect((await store.list())[0]).toMatchObject({ status: 'failed', lastError: 'بيانات غير صحيحة' });
    await processor.flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('runs one flush at a time (no double sending)', async () => {
    const store = memoryOutbox([item('a', 1)]);
    let release: (v: { reportId: number }) => void = () => {};
    const send = jest.fn(() => new Promise<{ reportId: number }>((r) => (release = r)));
    const processor = createOutboxProcessor({ store, send, deleteFiles: jest.fn() });
    const first = processor.flush();
    const second = processor.flush();
    expect(first).toBe(second);
    await Promise.resolve();
    release({ reportId: 1 });
    await expect(first).resolves.toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
