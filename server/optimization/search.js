import { better, compare, routeCost } from './evaluate.js';
import { haversine } from './travel.js';

export function emptySolution(engineers, evaluate) {
  return {
    mode: evaluate.mode,
    lists: engineers.map(() => []),
    routes: engineers.map((e) => evaluate(e, [])),
    unassigned: [],
  };
}

export function baseline(jobs, engineers, evaluate) {
  const solution = emptySolution(engineers, evaluate);
  // Exact PDF §2.3: arrival order, first feasible engineer, append only.
  for (const job of jobs) {
    let inserted = false;
    for (let e = 0; e < engineers.length; e++) {
      const list = [...solution.lists[e], job],
        route = evaluate(engineers[e], list);
      if (route) {
        solution.lists[e] = list;
        solution.routes[e] = route;
        inserted = true;
        break;
      }
    }
    if (!inserted) solution.unassigned.push(job);
  }
  return solution;
}

function insertions(job, solution, engineers, evaluate, cache) {
  const choices = [];
  let jobCache = cache?.get(job.id);
  if (cache && !jobCache) {
    jobCache = new Map();
    cache.set(job.id, jobCache);
  }
  for (let e = 0; e < engineers.length; e++) {
    if (evaluate.compatible && !evaluate.compatible(engineers[e], job)) continue;
    const previous = jobCache?.get(e);
    // Lists are replaced, never mutated. The evaluator's context is immutable
    // during repair, so an unchanged list has exactly the same insertion cost.
    if (previous?.list === solution.lists[e]) {
      if (previous.best) choices.push(previous.best);
      continue;
    }
    let best = null;
    for (let p = 0; p <= solution.lists[e].length; p++) {
      const list = [...solution.lists[e].slice(0, p), job, ...solution.lists[e].slice(p)];
      const route = evaluate(engineers[e], list);
      if (!route) continue;
      const old = solution.routes[e];
      const oldCost = routeCost(old, evaluate.mode);
      const delta = routeCost(route, evaluate.mode).map((value, i) => value - oldCost[i]);
      if (!best || compare(delta, best.delta) < 0) best = { e, list, route, delta };
    }
    if (jobCache) jobCache.set(e, { list: solution.lists[e], best });
    if (best) choices.push(best);
  }
  return choices.sort((a, b) => compare(a.delta, b.delta));
}

export function repair(solution, pool, engineers, evaluate, regret = true, { cacheInsertions = true } = {}) {
  const remaining = [...pool];
  const cache = cacheInsertions ? new Map() : null;
  while (remaining.length) {
    let chosen = null;
    for (let i = 0; i < remaining.length; i++) {
      const job = remaining[i],
        choices = insertions(job, solution, engineers, evaluate, cache);
      if (!choices.length) continue;
      const first = choices[0],
        second = choices[1];
      const rank = [
        job.priority === 'urgent' ? 0 : 1,
        ...(regret
          ? [second ? 1 : 0, ...first.delta.map((value, n) => (second ? value - second.delta[n] : 0))]
          : [job.windowEnd]),
        job.windowEnd,
        ...first.delta,
      ];
      if (!chosen || compare(rank, chosen.rank) < 0) chosen = { i, first, rank };
      if (!regret && chosen) break;
    }
    if (!chosen) break;
    const { first, i } = chosen;
    solution.lists[first.e] = first.list;
    solution.routes[first.e] = first.route;
    const [inserted] = remaining.splice(i, 1);
    cache?.delete(inserted.id);
  }
  solution.unassigned = remaining;
  return solution;
}

function randomGenerator(seed) {
  let n = seed >>> 0;
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function improve(initial, jobs, engineers, evaluate, { seed = 42, iterations = 80 } = {}) {
  const random = randomGenerator(seed),
    weights = [1, 1, 1],
    counts = [0, 0, 0];
  let best = initial,
    current = initial,
    improvements = 0;
  for (let step = 0; step < iterations; step++) {
    const assigned = current.lists.flat();
    if (!assigned.length) break;
    let draw = random() * weights.reduce((s, n) => s + n, 0),
      operator = 0;
    while (operator < weights.length - 1 && draw > weights[operator]) draw -= weights[operator++];
    counts[operator]++;
    const count = Math.max(2, Math.min(12, Math.ceil(assigned.length * (0.08 + random() * 0.12))));
    let removed;
    if (operator === 0) {
      removed = [...assigned]
        .map((j) => ({ j, key: random() }))
        .sort((a, b) => a.key - b.key)
        .slice(0, count)
        .map((x) => x.j);
    } else if (operator === 1) {
      const anchor = assigned[Math.floor(random() * assigned.length)];
      removed = [...assigned]
        .sort(
          (a, b) =>
            haversine(a, anchor) +
            Math.abs(a.windowStart - anchor.windowStart) / 60 -
            (haversine(b, anchor) + Math.abs(b.windowStart - anchor.windowStart) / 60),
        )
        .slice(0, count);
    } else {
      const nonempty = current.lists.filter((l) => l.length).sort((a, b) => a.length - b.length);
      // Try closing an entire route, not just shaving a few metres from it.
      removed = nonempty[Math.floor(random() * Math.min(3, nonempty.length))];
    }
    const removedIds = new Set(removed.map((j) => j.id));
    const lists = current.lists.map((l) => l.filter((j) => !removedIds.has(j.id)));
    const candidate = {
      mode: evaluate.mode,
      lists,
      routes: lists.map((l, i) => evaluate(engineers[i], l)),
      unassigned: [],
    };
    // A real travel matrix need not satisfy the triangle inequality.
    if (candidate.routes.some((r) => !r)) continue;
    repair(candidate, [...current.unassigned, ...removed], engineers, evaluate, step % 3 !== 0);
    if (better(candidate, best)) {
      best = candidate;
      current = candidate;
      improvements++;
      weights[operator] = 0.85 * weights[operator] + 0.15 * 6;
    } else {
      weights[operator] = 0.85 * weights[operator] + 0.15;
      // Diversify only with equal coverage; never publish a worse incumbent.
      if (
        better(candidate, current) ||
        (candidate.unassigned.length === current.unassigned.length && random() < 0.12)
      )
        current = candidate;
    }
    if (step % 15 === 14) current = best;
  }
  return {
    solution: best,
    diagnostics: {
      iterations,
      improvements,
      operators: { random: counts[0], related: counts[1], route: counts[2] },
    },
  };
}
