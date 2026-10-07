import { useState } from 'react';
import { calculateKinney } from '../domain/risk';
import type { Scenario } from '../domain/types';

const format = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
export default function Hologram({ scenario }: { scenario: Scenario }) {
  const current = calculateKinney(scenario, 'current');
  const target = calculateKinney(scenario, 'planned');
  const [rotation, setRotation] = useState(0);
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
  const initial = point(scenario.probability, scenario.exposure, scenario.effect);
  const now = point(
    current.factors.probability.value,
    current.factors.exposure.value,
    current.factors.effect.value,
  );
  const after = point(
    target.factors.probability.value,
    target.factors.exposure.value,
    target.factors.effect.value,
  );
  const pts = [initial, now, after];
  const colors = ['#ff647c', '#ffc05f', '#64f2d5'];
  const groups = pts
    .map((p, i) => ({
      p,
      indices: pts
        .map((q, j) => (Math.abs(q[0] - p[0]) < 1 && Math.abs(q[1] - p[1]) < 1 ? j : -1))
        .filter((j) => j >= 0),
    }))
    .filter((g) => g.indices[0] === pts.indexOf(g.p));
  const cubes = Array.from({ length: 5 }, (_, i) => i / 4);
  const plane = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
  ]
    .map((p) => project(p[0], p[1], p[2]).join(','))
    .join(' ');
  return (
    <div className="hologram">
      <div className="holo-corner top-left" />
      <div className="holo-corner bottom-right" />
      <div className="holo-header">
        <span className="live-dot" /> RISICORUIMTE <span>W × B × E</span>
      </div>
      <svg
        viewBox="0 0 700 425"
        role="img"
        aria-label={`3D-risicoruimte met log(1 + factor)-projectie. Initieel ${format(current.initial)}, huidig ${format(current.score.value)}, prognose ${format(target.score.value)}.`}
      >
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <linearGradient id="plane" x2="0" y2="1">
            <stop stopColor="#0e544c" stopOpacity=".45" />
            <stop offset="1" stopColor="#112538" stopOpacity=".1" />
          </linearGradient>
        </defs>
        <polygon points={plane} fill="url(#plane)" stroke="#254e58" />
        {cubes.map((i) => (
          <g key={i} stroke="#244653" strokeWidth=".8" opacity=".65">
            <line
              x1={project(i, 0, 0)[0]}
              y1={project(i, 0, 0)[1]}
              x2={project(i, 1, 0)[0]}
              y2={project(i, 1, 0)[1]}
            />
            <line
              x1={project(0, i, 0)[0]}
              y1={project(0, i, 0)[1]}
              x2={project(1, i, 0)[0]}
              y2={project(1, i, 0)[1]}
            />
            <line
              x1={project(0, 1, i)[0]}
              y1={project(0, 1, i)[1]}
              x2={project(1, 1, i)[0]}
              y2={project(1, 1, i)[1]}
            />
            <line
              x1={project(0, 0, i)[0]}
              y1={project(0, 0, i)[1]}
              x2={project(0, 1, i)[0]}
              y2={project(0, 1, i)[1]}
            />
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
        {pts.map((p, i) => (
          <g key={i}>
            <ellipse cx={p[0]} cy={340} rx="35" ry="9" fill={colors[i]} opacity=".08" />
            <line
              x1={p[0]}
              y1={p[1]}
              x2={p[0]}
              y2={340}
              stroke={colors[i]}
              strokeDasharray="3 5"
              opacity=".2"
            />
          </g>
        ))}
        <path
          d={`M ${initial.join(' ')} L ${now.join(' ')} L ${after.join(' ')}`}
          fill="none"
          stroke="#68e8d4"
          strokeWidth="2"
          strokeDasharray="5 5"
        />
        {groups.map(({ p, indices }) => {
          const i = indices[indices.length - 1];
          return (
            <g key={i}>
              <circle
                cx={p[0]}
                cy={p[1]}
                r="21"
                fill={colors[i]}
                opacity=".3"
                filter="url(#glow)"
              />
              <circle
                cx={p[0]}
                cy={p[1]}
                r="10"
                fill="#091b27"
                stroke={colors[i]}
                strokeWidth="1.5"
              />
              <circle cx={p[0]} cy={p[1]} r="4" fill={colors[i]} />
              <text x={p[0] + 17} y={p[1] - 15 - i * 3} fontSize="12" fontWeight="600">
                {indices.map((j, k) => (
                  <tspan key={j} x={p[0] + 17} dy={k ? 15 : 0} fill={colors[j]}>
                    {['INITIEEL', 'HUIDIG', 'PROGNOSE'][j]} ·{' '}
                    {format([current.initial, current.score.value, target.score.value][j])}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
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
      <div className="holo-footer">
        <span>Log(1 + factor)-projectie · score-eenheden</span>
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
