import { ArrowRight, GitBranch } from 'lucide-react';
import './ModuleStartCard.css';

export default function ModuleStartCard({
  onStart,
  moduleCount,
  questionCount,
}: {
  onStart: () => void;
  moduleCount: number;
  questionCount: number;
}) {
  return (
    <section className="module-start-card" aria-label="Begin met modulekeuze">
      <div className="module-start-content">
        <span className="eyebrow"><GitBranch size={15} /> JE RI&E BEGINT HIER</span>
        <h2>Van wat er speelt naar de juiste vragen.</h2>
        <p>Kies je gevaren, verken de moduleboom en stel een onderzoek samen dat bij je werk past.</p>
        <div className="module-start-bottom">
          <button className="primary" onClick={onStart}>
            Start modulekeuze <ArrowRight size={17} />
          </button>
          <span>{moduleCount} thema’s en modules · {questionCount} beschikbare vragen</span>
        </div>
      </div>
      <svg className="module-start-map" viewBox="0 0 390 180" role="img" aria-label="Gevaren verbinden modules, vragen en je onderzoeksdossier">
        <defs>
          <linearGradient id="module-entry-line"><stop stopColor="#6be2c2"/><stop offset="1" stopColor="#83aefa"/></linearGradient>
          <radialGradient id="module-entry-glow"><stop stopColor="#6be2c2" stopOpacity=".18"/><stop offset="1" stopColor="#6be2c2" stopOpacity="0"/></radialGradient>
        </defs>
        <circle cx="188" cy="90" r="86" fill="url(#module-entry-glow)" />
        <g className="module-start-connections" fill="none" stroke="url(#module-entry-line)" strokeWidth="1.5">
          <path d="M105 44 C150 44 130 88 184 88" />
          <path d="M106 137 C149 137 140 93 184 93" />
          <path d="M210 89 C251 89 237 43 283 43" />
          <path d="M210 94 C252 94 239 137 283 137" />
        </g>
        <g className="module-start-hub">
          <circle cx="195" cy="91" r="29" fill="#112d33" stroke="#76e5c6" />
          <circle cx="195" cy="91" r="36" fill="none" stroke="#76e5c6" opacity=".2" />
          <path d="M183 90 H207 M195 79 V102 M183 90 V80 M207 90 V102" fill="none" stroke="#9ef3dd" strokeWidth="2" />
          <circle cx="183" cy="78" r="3" fill="#9ef3dd"/><circle cx="207" cy="104" r="3" fill="#9ef3dd"/>
        </g>
        {[
          { x: 12, y: 27, text: 'Gevaren', dot: '#84e2be' },
          { x: 12, y: 119, text: 'Modules', dot: '#94b9ed' },
          { x: 283, y: 26, text: 'Vragen', dot: '#abacf2' },
          { x: 283, y: 119, text: 'Dossier', dot: '#e9c27a' },
        ].map(node => (
          <g key={node.text} transform={`translate(${node.x} ${node.y})`}>
            <rect width="93" height="34" rx="10" fill="#132633" stroke="#355564" />
            <circle cx="14" cy="17" r="3" fill={node.dot}/>
            <text x="26" y="21" fill="#daeaf0" fontSize="12">{node.text}</text>
          </g>
        ))}
      </svg>
    </section>
  );
}
