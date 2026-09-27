"""Local OR-Tools CP-SAT solver. No network/API key; one JSON request/response.

Optional circuit per engineer with a zero-cost virtual return (open route).
Lexicographic stages fix the best found value before the next stage. A FEASIBLE
stage is not a proof of optimality; its bound/status are returned to the UI.
"""
import json
import sys
import time
import ortools
from ortools.sat.python import cp_model


def solve(p):
    started = time.monotonic()
    model = cp_model.CpModel()
    jobs, engineers = p['jobs'], p['engineers']
    starts = {i: model.new_int_var(j['lo'], max(j['lo'], j['hi']), f't{i}') for i, j in enumerate(jobs, 1)}
    assignments = {i: [] for i in starts}
    routes, used, changed, distances, travel, balance = [], [], [], [], [], []
    hinted_starts = {}
    for k, e in enumerate(engineers):
        circuit, ys, selected = [], {}, {}
        initial = [v['i'] for v in e['initial']]
        initial_arcs = set(zip([0] + initial, initial + [0]))
        idle = model.new_bool_var(f'idle{k}')
        circuit.append((0, 0, idle))
        model.add_hint(idle, int(not initial))
        active = model.new_bool_var(f'used{k}')
        model.add(active == (1 if e['locked'] else 1 - idle))
        used.append(active)
        model.add_hint(active, int(bool(initial) or e['locked']))
        for candidate in e['candidates']:
            i = candidate['i']
            y = model.new_bool_var(f'y{k}_{i}')
            ys[i] = y
            assignments[i].append(y)
            circuit.append((i, i, y.negated()))
            model.add_hint(y, int(i in initial))
            model.add(starts[i] + jobs[i - 1]['duration'] <= e['end']).only_enforce_if(y)
            if candidate['changed']:
                changed.append(y)
            back = model.new_bool_var(f'a{k}_{i}_0')
            circuit.append((i, 0, back))
            selected[(i, 0)] = back
            model.add_hint(back, int((i, 0) in initial_arcs))
        for a in e['arcs']:
            i, j = a['from'], a['to']
            v = model.new_bool_var(f'a{k}_{i}_{j}')
            circuit.append((i, j, v))
            selected[(i, j)] = v
            origin = starts[i] + jobs[i - 1]['duration'] if i else e['start']
            model.add(starts[j] >= origin + a['seconds']).only_enforce_if(v)
            distances.append(v * a['metres'])
            travel.append(v * a['seconds'])
            model.add_hint(v, int((i, j) in initial_arcs))
        model.add_circuit(circuit)
        routes.append(selected)
        for v in e['initial']:
            hinted_starts[v['i']] = v['start']
        if p['balanceWork']:
            cap = e['baseWork'] + sum(jobs[i - 1]['duration'] for i in ys)
            work = model.new_int_var(0, cap, f'work{k}')
            model.add(work == e['baseWork'] + sum(y * jobs[i - 1]['duration'] for i, y in ys.items()))
            square = model.new_int_var(0, cap * cap, f'square{k}')
            model.add_multiplication_equality(square, [work, work])
            denominator = e['capacity'] * 60
            cost = model.new_int_var(0, (100 * cap * cap + denominator // 2) // denominator, f'balance{k}')
            model.add_division_equality(cost, 100 * square + denominator // 2, denominator)
            initial_work = e['baseWork'] + sum(jobs[i - 1]['duration'] for i in initial)
            model.add_hint(work, initial_work)
            model.add_hint(square, initial_work * initial_work)
            model.add_hint(cost, (100 * initial_work * initial_work + denominator // 2) // denominator)
            balance.append(cost)
    dropped, urgent_dropped, response = [], [], []
    for i, j in enumerate(jobs, 1):
        served = model.new_bool_var(f'served{i}')
        model.add(sum(assignments[i]) == served)
        if j['lo'] > j['hi']:
            model.add(served == 0)
        model.add_hint(served, int(i in hinted_starts))
        model.add_hint(starts[i], hinted_starts.get(i, j['lo']))
        dropped.append(1 - served)
        if j['urgent']:
            urgent_dropped.append(1 - served)
            delay = model.new_int_var(0, 86400, f'delay{i}')
            positive = model.new_int_var(0, 86400, f'positive{i}')
            model.add_max_equality(positive, [0, starts[i] - j['created']])
            model.add(delay == positive).only_enforce_if(served)
            model.add(delay == 0).only_enforce_if(served.negated())
            initial_delay = max(0, hinted_starts.get(i, j['lo']) - j['created'])
            model.add_hint(positive, initial_delay)
            model.add_hint(delay, initial_delay if i in hinted_starts else 0)
            response.append(delay)
    primary = [('urgentResponseSeconds', sum(response)), ('usedEngineers', sum(used))]
    if p['mode'] != 'emergency':
        primary.reverse()
    objectives = [('unassignedUrgent', sum(urgent_dropped)), ('unassigned', sum(dropped))] + primary
    if p['balanceWork']:
        objectives.append(('workBalance', sum(balance)))
    objectives += [('changedAssignments', sum(changed)), ('distanceMetres', sum(distances)), ('travelSeconds', sum(travel))]
    stages = []
    output = [[v['i'] for v in e['initial']] for e in engineers]
    incumbent = None
    for idx, (name, expression) in enumerate(objectives):
        remaining = p['seconds'] - (time.monotonic() - started)
        if remaining <= 0:
            break
        if isinstance(expression, int):
            stages.append(dict(name=name, status='OPTIMAL', value=expression, bound=expression))
            continue
        model.minimize(expression)
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = max(0.01, remaining / (len(objectives) - idx))
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = p['seed']
        status = solver.solve(model)
        elapsed = solver.wall_time
        attempts = [dict(status=solver.status_name(status), seconds=elapsed)]
        # A small first-stage slice may be spent entirely in presolve on a large
        # instance. Spend the remaining total budget rather than stop early and
        # mistake the common JS initial plan for an OR-Tools solution.
        remaining = p['seconds'] - (time.monotonic() - started)
        if status == cp_model.UNKNOWN and remaining > 0.1:
            solver.parameters.max_time_in_seconds = remaining
            status = solver.solve(model)
            elapsed += solver.wall_time
            attempts.append(dict(status=solver.status_name(status), seconds=solver.wall_time))
        feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)
        stages.append(dict(name=name, status=solver.status_name(status), value=solver.value(expression) if feasible else None, bound=solver.best_objective_bound if status != cp_model.MODEL_INVALID else None, seconds=elapsed, attempts=attempts))
        if not feasible:
            break
        incumbent = solver
        output = []
        for selected in routes:
            successors = {a: b for (a, b), v in selected.items() if solver.boolean_value(v)}
            route, node = [], successors.get(0, 0)
            while node:
                if node in route:
                    raise ValueError('Invalid circuit')
                route.append(node)
                node = successors[node]
            output.append(route)
        model.add(expression == solver.value(expression))
        model.clear_hints()
        for v in range(len(model.proto.variables)):
            variable = model.get_int_var_from_proto_index(v)
            model.add_hint(variable, solver.value(variable))
    return dict(lists=[[jobs[i - 1]['id'] for i in route] for route in output], diagnostics=dict(version=ortools.__version__, engine='CP-SAT', stages=stages, found=incumbent is not None, allStagesOptimal=len(stages) == len(objectives) and all(s['status'] == 'OPTIMAL' for s in stages), modelVariables=len(model.proto.variables), modelConstraints=len(model.proto.constraints), seconds=time.monotonic() - started, precision='integer seconds / metres; validated in JS'))


if __name__ == '__main__':
    if '--version' in sys.argv:
        print(json.dumps({'version': ortools.__version__, 'engine': 'CP-SAT'}))
    else:
        print(json.dumps(solve(json.load(sys.stdin))))
