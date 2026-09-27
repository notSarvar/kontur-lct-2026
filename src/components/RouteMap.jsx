import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const clock = (n) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(n % 60)
    .toString()
    .padStart(2, '0')}`;
export default function RouteMap({
  state,
  selected = 'all',
  onJob = () => {},
  compact = false,
  picker,
  onPick,
}) {
  const element = useRef(),
    map = useRef(),
    layers = useRef(),
    callbacks = useRef({ onJob, onPick }),
    fitKey = useRef('');
  const [tileError, setTileError] = useState(false);
  callbacks.current = { onJob, onPick };
  useEffect(() => {
    map.current = L.map(element.current, { zoomControl: false, attributionControl: true }).setView(
      [55.758, 37.62],
      12,
    );
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.org/fixthemap">Исправить карту</a>',
      maxZoom: 19,
    });
    tiles.on('tileerror', () => setTileError(true));
    tiles.on('tileload', () => setTileError(false));
    tiles.addTo(map.current);
    layers.current = L.layerGroup().addTo(map.current);
    map.current.on('click', (event) =>
      callbacks.current.onPick?.({
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      }),
    );
    const observer = new ResizeObserver(() => map.current?.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      map.current.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    layers.current.clearLayers();
    if (picker) {
      L.circleMarker([picker.lat, picker.lng], {
        radius: 10,
        color: '#fff',
        weight: 3,
        fillColor: '#237d68',
        fillOpacity: 1,
      }).addTo(layers.current);
      if (!fitKey.current) {
        map.current.setView([picker.lat, picker.lng], 13);
        fitKey.current = 'picker';
      }
      return;
    }
    if (!state) return;
    const jobs = Object.fromEntries(state.jobs.map((j) => [j.id, j])),
      positions = [];
    const routes = state.plan?.routes || [];
    for (const route of routes) {
      if (selected !== 'all' && route.engineerId !== selected) continue;
      const engineer = state.engineers.find((e) => e.id === route.engineerId);
      if (route.segments)
        for (const segment of route.segments)
          L.polyline(segment.coordinates, {
            color: selected === 'all' ? '#94a6a0' : '#237d68',
            weight: selected === 'all' ? 3 : 4,
            opacity: 0.75,
            dashArray: segment.roadGeometry ? null : '7 6',
          }).addTo(layers.current);
      if (!route.segments && route.geometry?.length > 1)
        L.polyline(route.geometry, {
          color: selected === 'all' ? '#94a6a0' : '#237d68',
          weight: selected === 'all' ? 3 : 4,
          opacity: 0.75,
          dashArray: route.roadGeometry ? null : '7 6',
          lineCap: 'round',
        }).addTo(layers.current);
      route.stops.forEach((stop, i) => {
        const job = jobs[stop.jobId];
        if (!job || !Number.isFinite(job.lat) || !Number.isFinite(job.lng)) return;
        const icon = L.divIcon({
          className: 'job-pin-wrap',
          html: `<div class="job-pin ${job.priority === 'urgent' ? 'urgent-pin' : ''}" style="--pin:${job.priority === 'urgent' ? '#b97723' : '#647c73'}">${i + 1}</div>`,
          iconSize: [28, 34],
          iconAnchor: [14, 30],
        });
        L.marker([job.lat, job.lng], { icon })
          .addTo(layers.current)
          .bindTooltip(
            `<b>№${job.number} · ${esc(job.title)}</b><br>${esc(job.address)}<br>${clock(stop.start)}–${clock(stop.end)}`,
          )
          .on('click', () => callbacks.current.onJob(job.id));
        positions.push([job.lat, job.lng]);
      });
    }
    for (const job of state.jobs.filter(
      (j) => ['blocked', 'manual_review'].includes(j.status) || (j.status === 'pending' && !j.engineerId),
    )) {
      if (selected !== 'all' || !Number.isFinite(job.lat) || !Number.isFinite(job.lng)) continue;
      L.marker([job.lat, job.lng], {
        icon: L.divIcon({
          className: 'job-pin-wrap',
          html: '<div class="job-pin unassigned-pin">!</div>',
          iconSize: [28, 34],
          iconAnchor: [14, 30],
        }),
      })
        .addTo(layers.current)
        .bindTooltip(esc(job.title))
        .on('click', () => callbacks.current.onJob(job.id));
      positions.push([job.lat, job.lng]);
    }
    for (const e of state.engineers) {
      if (
        (selected !== 'all' && selected !== e.id) ||
        !Number.isFinite(e.position.lat) ||
        !Number.isFinite(e.position.lng)
      )
        continue;
      L.marker([e.position.lat, e.position.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: 'engineer-pin-wrap',
          html: `<div class="engineer-pin" style="--pin:#647c73"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="6" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M8 14v7m8-7v7"/></svg></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      })
        .addTo(layers.current)
        .bindTooltip(esc(e.name));
      positions.push([e.position.lat, e.position.lng]);
    }
    const nextKey = `${state.dataset?.id || state.seed}-${selected}-${state.jobs.length}`;
    if (positions.length && fitKey.current !== nextKey) {
      map.current.fitBounds(L.latLngBounds(positions).pad(0.18), {
        maxZoom: compact ? 13 : 14,
        padding: [25, 25],
        animate: false,
      });
      fitKey.current = nextKey;
    }
  }, [state, selected, picker, compact]);
  return (
    <div className={`route-map ${compact ? 'compact' : ''}`}>
      <div ref={element} className="map-canvas" />
      {tileError && (
        <div className="map-error">
          Подложка карты недоступна. Точки и расчёт маршрутов продолжают работать.
        </div>
      )}
      {onPick && <div className="map-picker-hint">Нажмите на карту, чтобы выбрать объект</div>}
    </div>
  );
}
