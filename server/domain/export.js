const jobFields = [
  'id',
  'number',
  'title',
  'address',
  'lat',
  'lng',
  'type',
  'windowStart',
  'windowEnd',
  'duration',
  'skills',
  'equipment',
  'priority',
  'requiredTransport',
  'contact',
  'source',
  'originalWindow',
  'pinnedEngineerId',
  'geocodingCandidates',
  'sop',
];
export function exportScenario(state) {
  return {
    version: 2,
    catalogVersion: state.catalogVersion,
    sopTemplates: state.sopTemplates,
    jobs: state.jobs.map((j) =>
      Object.fromEntries(jobFields.filter((k) => j[k] !== undefined).map((k) => [k, j[k]])),
    ),
    engineers: state.engineers.map(
      ({ id, name, skills, equipment, transport, shiftStart, shiftEnd, home, workHistory }) => ({
        id,
        name,
        skills,
        equipment,
        transport,
        shiftStart,
        shiftEnd,
        home,
        workHistory,
      }),
    ),
  };
}
