import { persistOptimisticSetting } from './settingsPersistence';

test('rolls an optimistic setting back when an offline save fails', async () => {
  const previous = { preferredMensaId: '422' };
  const next = { preferredMensaId: '421' };
  const applied = [];
  const offline = new Error('API write blocked: device is offline');

  await expect(persistOptimisticSetting({
    previous,
    next,
    apply: value => applied.push(value),
    persist: vi.fn().mockRejectedValue(offline),
  })).rejects.toBe(offline);

  expect(applied).toEqual([next, previous]);
});

test('keeps an optimistic setting only after persistence succeeds', async () => {
  const previous = { targetEcts: 120 };
  const next = { targetEcts: 180 };
  const applied = [];

  await expect(persistOptimisticSetting({
    previous,
    next,
    apply: value => applied.push(value),
    persist: vi.fn().mockResolvedValue({ targetEcts: 180 }),
  })).resolves.toBe(next);

  expect(applied).toEqual([next]);
});
