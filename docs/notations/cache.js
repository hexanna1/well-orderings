export function cachedByNumber(cache, owner, number, compute) {
  let values = cache.get(owner);
  if (values === undefined) {
    values = new Map();
    cache.set(owner, values);
  } else if (values.has(number)) return values.get(number);
  const value = compute();
  values.set(number, value);
  return value;
}

export function weakPairGet(cache, left, right) { return cache.get(left)?.get(right); }

export function weakPairSet(cache, left, right, value) {
  let values = cache.get(left);
  if (values === undefined) {
    values = new WeakMap();
    cache.set(left, values);
  }
  values.set(right, value);
}
