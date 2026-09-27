import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ortoolsProblem } from './ortools-model.js';
import { optimizerSettings } from './settings.js';

const python = () =>
  process.env.ORTOOLS_PYTHON || fileURLToPath(new URL('../../.venv-optimizer/bin/python', import.meta.url));
function pythonCall(payload, timeout = 10000, version = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      python(),
      [fileURLToPath(new URL('./ortools_solver.py', import.meta.url)), ...(version ? ['--version'] : [])],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let stdout = '',
      stderr = '',
      settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(Object.assign(new Error('OR-Tools превысил лимит времени процесса'), { status: 503 }));
    }, timeout);
    child.on('error', () =>
      finish(
        Object.assign(
          new Error(
            'OR-Tools недоступен. Установите requirements-optimizer.txt в .venv-optimizer или задайте ORTOOLS_PYTHON.',
          ),
          { status: 503 },
        ),
      ),
    );
    child.stdin.on('error', () => {});
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('close', (code) => {
      if (code !== 0)
        return finish(
          Object.assign(new Error(`Ошибка локального OR-Tools: ${stderr || `код ${code}`}`), { status: 503 }),
        );
      try {
        finish(null, JSON.parse(stdout));
      } catch {
        finish(new Error('Invalid OR-Tools output'));
      }
    });
    child.stdin.end(version ? '' : JSON.stringify(payload));
  });
}
export async function optimizerCapabilities() {
  try {
    return { alns: true, ortools: { available: true, ...(await pythonCall(null, 10000, true)) } };
  } catch (error) {
    return { alns: true, ortools: { available: false, message: error.message } };
  }
}
export function solveInWorker(state, matrix, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { state, matrix, options },
      execArgv: process.execArgv.filter((a) => !a.startsWith('--input-type')),
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(Object.assign(new Error('Лимит поиска ALNS превышен; уменьшите бюджет'), { status: 503 }));
    }, 120000);
    worker.once('message', (data) => {
      clearTimeout(timer);
      data.error ? reject(new Error(data.error)) : resolve(data.plan);
    });
    worker.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code) reject(new Error(`Optimizer worker exit ${code}`));
    });
  });
}
export async function solveSelected(state, matrix = {}, options = {}) {
  const settings = optimizerSettings(state.settings);
  state = { ...state, settings: { ...state.settings, ...settings } };
  if (settings.solver === 'alns') return solveInWorker(state, matrix, options);
  const start = performance.now();
  const initial = await solveInWorker(state, matrix, { iterations: 0, restarts: 1 });
  const output = await pythonCall(
    ortoolsProblem(state, matrix, initial),
    (settings.ortoolsSeconds + 20) * 1000,
  );
  const plan = await solveInWorker(state, matrix, {
    externalLists: output.lists,
    externalDiagnostics: output.diagnostics,
  });
  plan.metrics.computeMs = Math.round(performance.now() - start);
  return plan;
}

export async function compareSolvers(state, matrix = {}, options = {}) {
  const snapshot = structuredClone(state);
  snapshot.settings = { ...snapshot.settings, ...optimizerSettings({ ...snapshot.settings, ...options }) };
  const alnsState = structuredClone(snapshot),
    ortoolsState = structuredClone(snapshot);
  alnsState.settings.solver = 'alns';
  ortoolsState.settings.solver = 'ortools';
  // Sequential, to avoid solver contention making timing comparisons misleading.
  const alns = await solveSelected(alnsState, matrix);
  const ortools = await solveSelected(ortoolsState, matrix);
  const rows = (plan) => ({
    solver: plan.solver,
    metrics: plan.metrics,
    objective: plan.objective,
    diagnostics: plan.diagnostics,
    jobIds: plan.routes.flatMap((r) => r.stops.filter((s) => !s.locked).map((s) => s.jobId)).sort(),
  });
  const a = rows(alns),
    b = rows(ortools);
  return {
    revision: state.revision,
    time: state.time,
    settings: snapshot.settings,
    alns: a,
    ortools: b,
    sameAssignedJobs: JSON.stringify(a.jobIds) === JSON.stringify(b.jobIds),
    heldForReview: state.jobs.filter((j) => j.status === 'manual_review').length,
    baseline: {
      assigned: alns.metrics.baselineAssigned,
      engineers: alns.metrics.baselineUsedEngineers,
      km: alns.metrics.baselineKm,
      travel: alns.metrics.baselineTravel,
    },
  };
}
