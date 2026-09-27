import { parentPort, workerData } from 'node:worker_threads';
import { solve } from './solver.js';
try {
  parentPort.postMessage({ plan: solve(workerData.state, workerData.matrix, workerData.options) });
} catch (error) {
  parentPort.postMessage({ error: error.message });
}
