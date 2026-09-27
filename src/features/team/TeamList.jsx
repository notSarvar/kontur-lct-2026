import React, { useState } from 'react';
import { Plus, Search, Settings2, Smartphone } from 'lucide-react';
import { Avatar, Badge, Button, Empty } from '../../components/ui.jsx';
import { time, transport } from '../../shared/format.js';
import { engineerStatus, freeWindows } from './availability.js';

export default function TeamList({ state, edit, showApp }) {
  const [search, setSearch] = useState('');
  const people = state.engineers.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <section className="panel team-directory">
      <div className="panel-heading">
        <div>
          <h2>
            Команда <span className="heading-count">{state.engineers.length}</span>
          </h2>
          <p>{state.plan.metrics.usedEngineers} с выездами на сегодня</p>
        </div>
        <Button icon={Plus} onClick={() => edit()}>
          Добавить инженера
        </Button>
      </div>
      <div className="team-search search-input">
        <Search size={17} />
        <input
          aria-label="Найти инженера"
          placeholder="Найти инженера"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {people.map((e) => {
        const route = state.plan.routes.find((r) => r.engineerId === e.id);
        const status = engineerStatus(state, e);
        const next = freeWindows(state, e)[0];
        return (
          <article className={`team-member ${status.tone}`} key={e.id}>
            <Avatar engineer={e} />
            <div className="team-member-info">
              <h3>{e.name}</h3>
              <p>
                {time(e.shiftStart)}–{time(e.shiftEnd)} · {transport[e.transport]}
              </p>
              <div className="team-skills">{e.skills.map((k) => state.catalog.skills[k]).join(' · ')}</div>
            </div>
            <div className="team-member-status">
              <Badge tone={status.tone === 'problem' ? 'orange' : 'gray'}>{status.label}</Badge>
              <small>
                {route?.stops.length || 0} выездов{next ? ` · окно с ${time(next.start)}` : ''}
              </small>
            </div>
            <div className="team-member-actions">
              <Button icon={Settings2} onClick={() => edit(e.id)}>
                Ресурсы
              </Button>
              <button
                className="icon-button"
                title="Открыть приложение инженера"
                aria-label={`Открыть приложение: ${e.name}`}
                onClick={() => showApp(e.id)}
              >
                <Smartphone size={18} />
              </button>
            </div>
          </article>
        );
      })}
      {!people.length && <Empty text="Инженер не найден" />}
    </section>
  );
}
