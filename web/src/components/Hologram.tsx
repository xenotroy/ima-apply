import { useId, useState } from 'react';
import { calculateKinney } from '../domain/risk';
import type { Estimate, FactorEstimates, Scenario } from '../domain/types';
import './Hologram.css';

const format = (n: number) =>
  n > 0 && n < 0.01
    ? n.toExponential(2).replace('.', ',')
    : n.toLocaleString('nl-NL', { maximumFractionDigits: 2 });
const interval = (n: Estimate) => `${format(n.min)}–${format(n.max)}`;
const axes = [
  { key: 'probability', letter: 'W', label: 'Waarschijnlijkheid' },
  { key: 'exposure', letter: 'B', label: 'Blootstelling' },
  { key: 'effect', letter: 'E', label: 'Effect' },
] as const;

/** Every plotted state comes from the engine, never an extra reduction rule. */
export default function Hologram({ scenario }: { scenario: Scenario }) {
  const current = calculateKinney(scenario, 'current');
  const target = calculateKinney(scenario, 'planned');
  const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<'current' | 'planned'>('planned');
  const [selectedId, setSelectedId] = useState('');
  const prefix = useId().replace(/:/g, '');
  const result = mode === 'current' ? current : target;
  const selectedIndex = result.steps.findIndex((step) => step.controlId === selectedId);
  const selected = selectedIndex >= 0 ? result.steps[selectedIndex] : undefined;
  const initialFactors: FactorEstimates = {
    probability: {
      min: scenario.probability,
      value: scenario.probability,
      max: scenario.probability,
    },
    exposure: { min: scenario.exposure, value: scenario.exposure, max: scenario.exposure },
    effect: { min: scenario.effect, value: scenario.effect, max: scenario.effect },
  };
  const previous = selectedIndex > 0 ? result.steps[selectedIndex - 1] : undefined;
  const beforeFactors = selected ? (previous?.factors ?? initialFactors) : initialFactors;
  const initialScore = { min: result.initial, value: result.initial, max: result.initial };
  const beforeScore = selected ? (previous?.score ?? initialScore) : initialScore;
  const afterFactors = selected?.factors ?? result.factors;
  const afterScore = selected?.score ?? result.score;
  const control = selected && scenario.controls.find((item) => item.id === selected.controlId);
  const changed = axes.filter(({ key }) =>
    (['min', 'value', 'max'] as const).some(
      (bound) => beforeFactors[key][bound] !== afterFactors[key][bound],
    ),
  );
  const uncertain = axes.some(({ key }) => afterFactors[key].min !== afterFactors[key].max);
  const changedPath = current.creditedControlIds.some(
    (id) => !target.creditedControlIds.includes(id),
  );
  const norm = (n: number, max: number) =>
    Math.max(0, Math.min(1, Math.log10(1 + n) / Math.log10(1 + max)));
  const project = (w: number, b: number, e: number) => {
    const angle = (rotation * Math.PI) / 180;
    const x = (w - 0.5) * Math.cos(angle) - (b - 0.5) * Math.sin(angle);
    const z = (w - 0.5) * Math.sin(angle) + (b - 0.5) * Math.cos(angle);
    return [350 + (x - z) * 235, 310 + (x + z) * 90 - e * 190];
  };
  const point = (w: number, b: number, e: number) =>
    project(norm(w, 10), norm(b, 10), norm(e, 100));
  const factorPoint = (f: FactorEstimates, bound: keyof Estimate = 'value') =>
    point(f.probability[bound], f.exposure[bound], f.effect[bound]);
  const initial = factorPoint(initialFactors);
  const now = factorPoint(current.factors);
  const after = factorPoint(target.factors);
  const from = factorPoint(beforeFactors);
  const to = factorPoint(afterFactors);
  const pts = [initial, now, after];
  const colors = ['#ff647c', '#ffc05f', '#64f2d5'];
  const names = ['INITIEEL', 'HUIDIG', 'PROGNOSE'];
  const groups = pts
    .map((p, i) => ({
      p,
      indices: pts
        .map((q, j) => (Math.abs(q[0] - p[0]) < 1 && Math.abs(q[1] - p[1]) < 1 ? j : -1))
        .filter((j) => j >= 0),
      i,
    }))
    .filter((g) => g.indices[0] === g.i);
  // Marginal factor bounds, not a probability/confidence volume.
  const corners = Array.from({ length: 8 }, (_, i) =>
    point(
      afterFactors.probability[i & 1 ? 'max' : 'min'],
      afterFactors.exposure[i & 2 ? 'max' : 'min'],
      afterFactors.effect[i & 4 ? 'max' : 'min'],
    ),
  );
  const edges = corners.flatMap((p, i) =>
    [1, 2, 4].filter((bit) => !(i & bit)).map((bit) => [p, corners[i | bit]]),
  );
  const cubes = Array.from({ length: 5 }, (_, i) => i / 4);
  const plane = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ]
    .map((p) => project(p[0], p[1], p[2]).join(','))
    .join(' ');
  const samePoint = Math.abs(from[0] - to[0]) < 1 && Math.abs(from[1] - to[1]) < 1;
  const sameFactors = axes.every(({ key }) => beforeFactors[key].value === afterFactors[key].value);

  return (
    <div className="hologram">
      <div className="holo-corner top-left" />
      <div className="holo-corner bottom-right" />
      <div className="holo-header">
        <span className="live-dot" /> RISICORUIMTE <span>W × B × E</span>
      </div>
      <div className="holo-controls">
        <label>
          Berekeningspad
          <select
            aria-label="Berekeningspad risicoruimte"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as typeof mode);
              setSelectedId('');
            }}
          >
            <option value="current">Huidige bewezen beheersing</option>
            <option value="planned">Prognose inclusief plannen</option>
          </select>
        </label>
        <label>
          Berekende maatregelstap
          <select
            aria-label="Berekende maatregelstap"
            value={selected?.controlId ?? ''}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            <option value="">Totaalbeeld van dit pad</option>
            {result.steps.map((step, i) => (
              <option key={step.controlId} value={step.controlId}>
                {i + 1}. {step.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <svg
        viewBox="0 0 700 425"
        role="img"
        aria-label={`Risicoruimte in score-eenheden. Initieel ${format(current.initial)}, huidig ${format(current.score.value)}, prognose ${format(target.score.value)}. ${selected ? `Berekende stap ${selected.title}: ${format(beforeScore.value)} naar ${format(afterScore.value)}. ` : ''}Scoreband na de gekozen stap of het gekozen pad ${interval(afterScore)}. Log(1 + factor)-projectie.`}
      >
        <defs>
          <filter id={`${prefix}-glow`}>
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <linearGradient id={`${prefix}-plane`} x2="0" y2="1">
            <stop stopColor="#0e544c" stopOpacity=".45" />
            <stop offset="1" stopColor="#112538" stopOpacity=".1" />
          </linearGradient>
          <marker
            id={`${prefix}-arrow`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#b4c8ff" />
          </marker>
        </defs>
        <polygon points={plane} fill={`url(#${prefix}-plane)`} stroke="#254e58" />
        {cubes.map((i) => (
          <g key={i} stroke="#244653" strokeWidth=".8" opacity=".65">
            {[
              [i, 0, 0, i, 1, 0],
              [0, i, 0, 1, i, 0],
              [0, 1, i, 1, 1, i],
              [0, 0, i, 0, 1, i],
            ].map((a, k) => (
              <line
                key={k}
                x1={project(a[0], a[1], a[2])[0]}
                y1={project(a[0], a[1], a[2])[1]}
                x2={project(a[3], a[4], a[5])[0]}
                y2={project(a[3], a[4], a[5])[1]}
              />
            ))}
          </g>
        ))}
        {[
          [0, 0, 0, 1, 0, 0],
          [0, 0, 0, 0, 1, 0],
          [0, 0, 0, 0, 0, 1],
        ].map((a, i) => (
          <line
            key={i}
            x1={project(a[0], a[1], a[2])[0]}
            y1={project(a[0], a[1], a[2])[1]}
            x2={project(a[3], a[4], a[5])[0]}
            y2={project(a[3], a[4], a[5])[1]}
            stroke="#64979c"
            strokeWidth="1.2"
          />
        ))}
        {uncertain && (
          <g
            aria-label="Ingevoerde factorbandbreedtes"
            stroke="#a5b7f5"
            strokeWidth="1.5"
            strokeDasharray="3 4"
            opacity=".5"
          >
            {edges.map(([p, q], i) => (
              <line key={i} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />
            ))}
          </g>
        )}
        <path
          d={`M ${initial.join(' ')} L ${now.join(' ')} L ${after.join(' ')}`}
          fill="none"
          stroke="#68e8d4"
          strokeWidth="2"
          strokeDasharray="5 5"
          opacity={selected ? '.25' : '.7'}
        />
        {groups.map(({ p, indices }) => {
          const i = indices[indices.length - 1];
          return (
            <g key={i} opacity={selected ? '.4' : '1'}>
              <circle
                cx={p[0]}
                cy={p[1]}
                r="21"
                fill={colors[i]}
                opacity=".3"
                filter={`url(#${prefix}-glow)`}
              />
              <circle
                cx={p[0]}
                cy={p[1]}
                r="8"
                fill="#091b27"
                stroke={colors[i]}
                strokeWidth="1.5"
              />
              <circle cx={p[0]} cy={p[1]} r="3" fill={colors[i]} />
              {!selected && (
                <text x={p[0] + 15} y={p[1] - 15 - i * 3} fontSize="12" fontWeight="600">
                  {indices.map((j, k) => (
                    <tspan key={j} x={p[0] + 15} dy={k ? 15 : 0} fill={colors[j]}>
                      {names[j]} ·{' '}
                      {format([current.initial, current.score.value, target.score.value][j])}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
        {selected && (
          <g>
            {!samePoint && (
              <line
                x1={from[0]}
                y1={from[1]}
                x2={to[0]}
                y2={to[1]}
                stroke="#b4c8ff"
                strokeWidth="3"
                markerEnd={`url(#${prefix}-arrow)`}
              />
            )}
            <circle
              cx={from[0]}
              cy={from[1]}
              r="9"
              fill="#0c1924"
              stroke="#b4c8ff"
              strokeWidth="2"
            />
            {!samePoint && (
              <circle cx={to[0]} cy={to[1]} r="9" fill="#b4c8ff" stroke="#e4ebff" strokeWidth="2" />
            )}
            <text x={from[0] + 15} y={from[1] - 15} fontSize="12" fill="#d2deff">
              {samePoint ? (sameFactors ? 'VOOR = NA' : 'VOOR / NA') : 'VOOR'} ·{' '}
              {format(beforeScore.value)}
              {samePoint && !sameFactors && ` / ${format(afterScore.value)} (projectie overlapt)`}
            </text>
            {!samePoint && (
              <text x={to[0] + 15} y={to[1] + 24} fontSize="12" fill="#d2deff">
                NA · {format(afterScore.value)}
              </text>
            )}
          </g>
        )}
        <text x="440" y="385" fill="#97adb8" fontSize="11">
          WAARSCHIJNLIJKHEID W
        </text>
        <text x="65" y="374" fill="#97adb8" fontSize="11">
          BLOOTSTELLING B
        </text>
        <text x="330" y="75" fill="#97adb8" fontSize="11">
          EFFECT E
        </text>
      </svg>
      <div className="holo-overview" aria-label="Drie overzichtspunten">
        {[current.initial, current.score.value, target.score.value].map((value, i) => (
          <span key={i}>
            <i style={{ background: colors[i] }} />
            {names[i].toLowerCase()} <strong>{format(value)}</strong>
          </span>
        ))}
      </div>
      <div className="holo-step-detail" aria-live="polite">
        <div className="holo-step-heading">
          <div>
            <span>{selected ? 'BEREKENDE MAATREGELSTAP' : 'GEKOZEN BEREKENINGSPAD'}</span>
            <strong>
              {selected?.title ??
                (mode === 'current' ? 'Huidige bewezen beheersing' : 'Prognose inclusief plannen')}
            </strong>
          </div>
          <small>
            {control?.status === 'planned'
              ? 'Gepland · prognose'
              : mode === 'planned'
                ? 'Prognosepad'
                : 'Huidig pad'}
          </small>
        </div>
        <div className="holo-score-route">
          <div>
            <small>{selected ? 'Vóór deze stap' : 'Uitgangsscenario'}</small>
            <strong>{format(beforeScore.value)}</strong>
            <span>Band {interval(beforeScore)}</span>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <small>{selected ? 'Na deze stap' : mode === 'current' ? 'Huidig' : 'Prognose'}</small>
            <strong>{format(afterScore.value)}</strong>
            <span>Band {interval(afterScore)}</span>
          </div>
        </div>
        <div className="holo-factor-route">
          {axes.map(({ key, letter, label }) => {
            const isChanged = changed.some((axis) => axis.key === key);
            return (
              <div key={key} className={isChanged ? 'changed' : ''}>
                <span>
                  <b>{letter}</b> {label}
                </span>
                <strong>
                  {format(beforeFactors[key].value)} → {format(afterFactors[key].value)}
                </strong>
                <small>Band na: {interval(afterFactors[key])}</small>
                <em>{isChanged ? 'Verandert in deze berekening' : 'Blijft gelijk'}</em>
              </div>
            );
          })}
        </div>
        <p className="holo-explanation">
          {selected
            ? 'Voor en na zijn opeenvolgende stappen binnen dit berekeningspad. Het verschil volgt de ingevoerde mechanismen en modelvolgorde.'
            : 'De drie punten tonen het uitgangsscenario, huidige beheersing en prognose. Selecteer een getelde maatregel om de verandering per factor te bekijken.'}{' '}
          Bandbreedtes zijn invoeraannames, geen betrouwbaarheidsgebied of voorspeld
          ongevalspercentage.
          {afterScore.value === 0 &&
            ' Nul betekent eliminatie binnen de ingevoerde scenario-aanname.'}
        </p>
        {changedPath && (
          <p className="holo-path-warning">
            Representatief modelpad wisselt: huidige en geplande beoordeling tellen andere
            maatregelen. De totale lijn huidig → prognose bewijst daardoor geen causale verbetering
            of verslechtering door één maatregel.
          </p>
        )}
        {!result.steps.length && (
          <p className="holo-explanation">
            Dit pad bevat geen maatregelen die voor scorecredit kwalificeren. Niet-getelde
            maatregelen blijven zichtbaar in de maatregelenlijst.
          </p>
        )}
      </div>
      <div className="holo-footer">
        <span>
          Log(1 + factor) · score-eenheden{uncertain ? ' · kader: factorbandbreedtes' : ''}
        </span>
        <label>
          Perspectief{' '}
          <input
            aria-label="Perspectief risicoruimte"
            type="range"
            min="-20"
            max="20"
            value={rotation}
            onChange={(e) => setRotation(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
