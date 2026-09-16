import { hasCoordinates } from '../optimization/travel.js';
export function geographyStatus(state) {
  const issues = state.jobs
    .filter((job) => !hasCoordinates(job))
    .map((job) => ({
      jobId: job.id,
      number: job.number,
      address: job.address,
      kind: 'address',
      message: 'Нет подтверждённых координат здания',
    }));
  const office = state.dataset?.office;
  if (office && (!hasCoordinates(office) || office.approximate))
    issues.unshift({
      kind: 'office',
      address: office.address,
      message: office.assumption || 'Нет подтверждённых координат офиса',
    });
  return {
    status: issues.length ? 'review' : 'ready',
    total: state.jobs.length,
    confirmed: state.jobs.filter(hasCoordinates).length,
    issues,
    source: 'OpenStreetMap / подтверждение диспетчера',
  };
}
