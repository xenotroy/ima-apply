import type { KinneyResult, LopaResult } from '../domain/types';
const num = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
export function Waterfall({ current, target }: { current: KinneyResult; target: KinneyResult }) {
  const steps = [
    { title: 'Initieel', value: target.initial },
    ...target.steps.map((s) => ({ title: s.title, value: s.score.value })),
    { title: 'Prognose', value: target.score.value },
  ];
  const max = Math.max(target.initial, 1);
  return (
    <div className="waterfall">
      <div className="section-row">
        <h3>Elke barrière maakt verschil</h3>
        <span className="muted">Lineaire scoreschaal</span>
      </div>
      <div className="waterfall-bars" role="img" aria-label="Scoreverloop per maatregel">
        {steps.map((s, i) => (
          <div className="fall-column" key={i}>
            <span className="fall-value">{num(s.value)}</span>
            <div className="bar-space">
              <div
                className={`fall-bar ${i === 0 ? 'initial' : i === steps.length - 1 ? 'target' : ''}`}
                style={{ height: `${Math.max(2, (s.value / max) * 100)}%` }}
              />
            </div>
            <span className="fall-label" title={s.title}>
              {s.title}
            </span>
          </div>
        ))}
      </div>
      <p className="caption">
        Huidig: {num(current.score.value)} · prognose: {num(target.score.value)}. Volgorde-effecten
        zijn modeluitkomsten; de totale combinatie bepaalt het eindresultaat.
      </p>
    </div>
  );
}
export function LopaChart({ result }: { result: LopaResult }) {
  const steps = [
    { title: 'Initiator', frequency: result.initiatingFrequency },
    { title: 'Na modifiers', frequency: result.unmitigatedFrequency },
    ...result.steps.map((s) => ({ title: s.title, frequency: s.frequency })),
  ];
  const exps = [
    ...steps.flatMap((s) => [
      Math.log10(s.frequency.min || 1e-12),
      Math.log10(s.frequency.max || 1e-12),
    ]),
    Math.log10(result.targetFrequency),
  ];
  const min = Math.floor(Math.min(...exps)) - 1,
    max = Math.ceil(Math.max(...exps)) + 1;
  const y = (n: number) => 25 + ((max - Math.log10(n || 1e-12)) / (max - min)) * 180;
  return (
    <div className="lopa-chart">
      <svg
        viewBox="0 0 680 280"
        role="img"
        aria-label="LOPA-frequentieverloop, logaritmische schaal in gebeurtenissen per jaar"
      >
        {Array.from({ length: max - min + 1 }, (_, i) => max - i).map((e) => (
          <g key={e}>
            <line x1="65" y1={y(10 ** e)} x2="645" y2={y(10 ** e)} stroke="#233644" />
            <text x="13" y={y(10 ** e) + 4} fill="#8d9dab" fontSize="12">
              10^{e}
            </text>
          </g>
        ))}
        <line
          x1="65"
          x2="645"
          y1={y(result.targetFrequency)}
          y2={y(result.targetFrequency)}
          stroke="#f7b25f"
          strokeDasharray="6 5"
        />
        <text x="65" y={y(result.targetFrequency) - 7} fill="#f7b25f" fontSize="11">
          Projectcriterium
        </text>
        <polyline
          points={steps
            .map(
              (s, i) =>
                `${110 + (i * 490) / Math.max(1, steps.length - 1)},${y(s.frequency.value)}`,
            )
            .join(' ')}
          fill="none"
          stroke="#65efd0"
          strokeWidth="2"
        />
        {steps.map((s, i) => {
          const x = 110 + (i * 490) / Math.max(1, steps.length - 1);
          return (
            <g key={i}>
              <line
                x1={x}
                x2={x}
                y1={y(s.frequency.min)}
                y2={y(s.frequency.max)}
                stroke="#65efd0"
                strokeWidth="9"
                opacity=".2"
              />
              <circle cx={x} cy={y(s.frequency.value)} r="5" fill="#65efd0" />
              <text x={x} y="240" textAnchor="middle" fill="#aebfcd" fontSize="11">
                {s.title.length > 27 ? s.title.slice(0, 24) + '…' : s.title}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="caption">
        Frequentie per jaar · logaritmische as · bandbreedtes zijn aannames, geen statistische
        betrouwbaarheidsintervallen.
      </p>
    </div>
  );
}
