import { useState } from 'react';
import { themes } from '../content/catalog';
import type { Dossier, WorkspaceAnswer } from '../data';
import { inventoryProgress } from '../data/inventory-progress';
import { Modal } from './Primitives';
import './inventory-overview.css';

export default function InventoryOverview({
  dossier,
  answers,
}: {
  dossier: Dossier;
  answers: WorkspaceAnswer[];
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const progress = inventoryProgress(dossier.questions, answers, dossier.id);
  const groups = [...new Set(dossier.questions.map((question) => question.themeId))].map(
    (themeId) => {
      const questions = dossier.questions.filter((question) => question.themeId === themeId);
      const module = dossier.modulePlanSnapshot?.modules.find((entry) =>
        entry.questionIds.some((id) => questions.some((question) => question.id === id)),
      );
      return {
        id: themeId,
        title: module?.title ?? themes.find((theme) => theme.id === themeId)?.title ?? themeId,
        ...inventoryProgress(questions, answers, dossier.id),
      };
    },
  );
  const pending = dossier.questions
    .map((question, index) => ({ question, index, answer: progress.byQuestion.get(question.id) }))
    .filter(({ answer }) => !answer || answer.choice === 'unknown' || answer.choice === 'partial');
  const markdown = [
    `# Gespreksvoorbereiding — ${dossier.title}`,
    '',
    `Export: ${new Date().toISOString()}`,
    `Dossier-ID: ${dossier.id}`,
    '',
    '## Scope',
    '',
    dossier.scope || 'Nog niet vastgelegd.',
    '',
    `Beoordelaar: ${dossier.assessor || 'Nog niet vastgelegd'}`,
    '',
    '## Inventarisatiestand',
    '',
    `${progress.total} vragen; ${progress.answered} met opgeslagen antwoord; ${progress.unanswered} niet beantwoord; ${progress.followUp} deels/onbekend.`,
    '',
    'Dit is invoervoortgang, geen oordeel over naleving of bewezen beheersing. Een nee-antwoord blijft een behandeld antwoord; beoordeel noodzakelijke acties afzonderlijk.',
    '',
    '## Thema’s in dit dossier',
    '',
    ...groups.map(
      (group) =>
        `- ${group.title}: ${group.answered}/${group.total} vastgelegd; ${group.unanswered} onbeantwoord; ${group.followUp} deels/onbekend.`,
    ),
    '',
    '## Vastgelegde modulekeuzes',
    '',
    ...(dossier.modulePlanSnapshot?.modules.map(
      (module) =>
        `- ${module.enabled ? 'Gekozen' : 'Niet gekozen'}: ${module.code} ${module.title}. Argumentatie: ${module.scopeNotes || 'Nog niet vastgelegd.'}`,
    ) ?? [
      'Geen moduleplan als momentopname aanwezig; onderstaande vragen zijn de bevroren dossierselectie.',
    ]),
    '',
    '## Resterende vragen en verduidelijking',
    '',
    ...pending.flatMap(({ question, index, answer }) => [
      `### ${index + 1}. ${question.title}`,
      '',
      `Vraag-ID: ${question.id}`,
      '',
      question.prompt,
      '',
      `Status: ${!answer ? 'Niet beantwoord' : answer.choice === 'partial' ? 'Deels' : 'Onbekend'}`,
      '',
      ...(answer
        ? [
            `Bestaande notitie: ${answer.note || '—'}`,
            '',
            `Bestaande onderbouwing: ${answer.evidence || '—'}`,
            '',
          ]
        : []),
      'Aanvulling / bron / vervolgactie:',
      '',
    ]),
    'Dit Markdown-bestand is een gespreksdocument. Gebruik Werkruimte exporteren voor een volledige herstelkopie.',
    '',
  ].join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ima-gespreksvoorbereiding.md';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <section className="panel inventory-overview" aria-label="Inventarisatiestand van dit dossier">
      <div className="section-row">
        <div>
          <div className="eyebrow">VOORBEREIDEN · HERVATTEN</div>
          <h2>Waar staan we?</h2>
        </div>
        <button className="secondary" onClick={() => setExportOpen(true)}>
          Gespreksvoorbereiding · MD
        </button>
      </div>
      <div className="inventory-metrics">
        <div>
          <strong>{progress.total}</strong>
          <span>Vragen in dit dossier</span>
        </div>
        <div>
          <strong>{progress.answered}</strong>
          <span>Antwoord vastgelegd</span>
        </div>
        <div>
          <strong>{progress.unanswered}</strong>
          <span>Niet beantwoord</span>
        </div>
        <div>
          <strong>{progress.followUp}</strong>
          <span>Deels / onbekend</span>
        </div>
      </div>
      <progress
        max={100}
        value={progress.percent}
        aria-label="Percentage vragen met opgeslagen antwoord"
      />
      <p className="caption">
        Invoervoortgang is geen oordeel over naleving. Deels/onbekend telt mee als vastgelegd
        antwoord. Nee-antwoorden vragen mogelijk om een vervolgactie.
      </p>
      <details>
        <summary>Thema’s en voortgang bekijken ({groups.length})</summary>
        <div className="inventory-theme-grid">
          {groups.map((group) => (
            <div key={group.id}>
              <strong>{group.title}</strong>
              <span>
                {group.answered} / {group.total} vastgelegd
              </span>
              <small>
                {group.unanswered} niet beantwoord · {group.followUp} deels/onbekend
              </small>
            </div>
          ))}
        </div>
      </details>
      {exportOpen && (
        <Modal title="Gespreksvoorbereiding in Markdown" onClose={() => setExportOpen(false)}>
          <p>
            Scope, vastgelegde modulekeuzes en resterende vragen met bestaande notities. Download
            het bestand of kopieer de tekst.
          </p>
          <textarea
            aria-label="Gespreksvoorbereiding Markdown"
            value={markdown}
            readOnly
            rows={15}
            onFocus={(event) => event.target.select()}
          />
          <button className="primary" onClick={download}>
            Download Markdown
          </button>
        </Modal>
      )}
    </section>
  );
}
