export async function persistOptimisticSetting({
  previous,
  next,
  apply,
  persist,
}) {
  apply(next);
  try {
    await persist(next);
    return next;
  } catch (error) {
    apply(previous);
    throw error;
  }
}
