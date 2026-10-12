import { useState } from 'react';
import type { WorkspaceState } from '../data/model';
import { modulePlanHash, modulePlanQuestionIds } from '../data/module-plan';
import {
  rieporterDepartmentPlans,
  type RieporterModuleCatalog,
} from '../data/rieporter-module-choice';

export default function DepartmentChoiceReasons({
  workspace,
  catalog,
  onEditPlan,
}: {
  workspace: WorkspaceState;
  catalog?: RieporterModuleCatalog;
  onEditPlan: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const sources = new Map(workspace.sources.map((source) => [source.id, source]));
  const decisions = (workspace.contentRecords ?? []).filter(
    (record) => record.schema === 'ima.department-module-decisions/v1',
  );
  return (
    <section className="rie-choice-reasons" aria-label="Argumentatie per afdeling">
      <h3>Van werkzaamheden en bronnen naar modulekeuze</h3>
      <p>
        Elke keuze is een onderzoeksscope. Niet geselecteerd betekent geen bewezen afwezigheid van
        een gevaar. Controleer werkzaamheden, lokale signalen en bronstatus tijdens het gesprek.
      </p>
      <label className="field">
        <span>Toon argumentatie van afdeling</span>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="">Alle afdelingen</option>
          {(workspace.departments ?? []).map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      {(workspace.departments ?? [])
        .filter((department) => !filter || department.id === filter)
        .map((department) => {
          const allPlans = rieporterDepartmentPlans(workspace, department.id);
          const sourcePlans = allPlans.filter((plan) =>
            plan.modules.some((module) => module.id.startsWith('rieporter-process:')),
          );
          const plans = sourcePlans.length ? sourcePlans : allPlans;
          return (
            <details className="rie-reason-department" key={department.id} open={Boolean(filter)}>
              <summary>
                <strong>{department.name}</strong>
                <span>
                  {plans.length} modulekeuze{plans.length === 1 ? '' : 's'}
                </span>
              </summary>
              <p>{department.activity || 'Werkzaamheden nog vast te leggen.'}</p>
              {!plans.length && (
                <p>
                  Geen eigen modulekeuze vastgelegd. Bevestig eerst of dit werkgebied een
                  afzonderlijk onderzoeksobject is; een bovenliggende unitkeuze wordt niet
                  automatisch overgenomen.
                </p>
              )}
              {plans.map((plan) => {
                const decision = decisions.find((record) => record.planId === plan.id);
                const conditional = Array.isArray(decision?.conditional)
                  ? decision.conditional
                  : [];
                const changed =
                  typeof decision?.planSha256 === 'string' &&
                  decision.planSha256 !== modulePlanHash(plan);
                const enabled = plan.modules.filter((module) => module.enabled);
                const selected = new Set(enabled.map((module) => module.id));
                const omitted = plan.modules.filter((module) => !module.enabled);
                const other =
                  catalog?.modules.filter(
                    (module) =>
                      !selected.has(module.id) && !omitted.some((item) => item.id === module.id),
                  ) ?? [];
                return (
                  <article className="rie-reason-plan" key={plan.id}>
                    <header>
                      <h4>{plan.title}</h4>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => onEditPlan(plan.id)}
                      >
                        Keuze en motivering aanpassen
                      </button>
                    </header>
                    <p>
                      Revisie {plan.revision} · {enabled.length} geselecteerde procesblokken ·{' '}
                      {modulePlanQuestionIds(plan).length} vragen
                    </p>
                    {changed && (
                      <p role="status">
                        Keuze gewijzigd sinds de bronvoorbereiding. Controleer de eerdere
                        voorwaarden tegen de huidige selectie.
                      </p>
                    )}
                    <h5>Geselecteerd — waarom?</h5>
                    {enabled.map((module) => (
                      <div className="rie-selected-reason" key={module.id}>
                        <strong>{module.title}</strong>
                        <p>
                          {module.scopeNotes ||
                            'Motivering nog niet vastgelegd. Leg werkzaamheden, gevaar, bron en scope vast.'}
                        </p>
                        {(module.excludedQuestionIds?.length ?? 0) > 0 && (
                          <p>
                            {module.excludedQuestionIds!.length} afzonderlijke vragen uitgesloten;
                            controleer de onderbouwing in het plan.
                          </p>
                        )}
                      </div>
                    ))}
                    {conditional.length > 0 && (
                      <>
                        <h5>Voorwaardelijk — eerst bevestigen</h5>
                        {conditional.map((item, index) => {
                          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
                          const value = item as Record<string, unknown>;
                          return (
                            <p className="rie-conditional-reason" key={index}>
                              <strong>{String(value.code ?? 'Onderwerp')}</strong> ·{' '}
                              {String(value.reason ?? '')}
                            </p>
                          );
                        })}
                      </>
                    )}
                    <details>
                      <summary>
                        Niet geselecteerd / nog niet beoordeeld ({omitted.length + other.length}{' '}
                        beschikbare procesblokken)
                      </summary>
                      <p>
                        {typeof decision?.unselectedReason === 'string'
                          ? decision.unselectedReason
                          : 'Geen bevestigde uitsluitingsgrond vastgelegd. Aanwezigheid, toepasselijkheid en lokale werkzaamheden eerst onderzoeken.'}
                      </p>
                      {omitted.map((module) => (
                        <p key={module.id}>
                          <strong>{module.title}</strong> ·{' '}
                          {module.scopeNotes ||
                            'Uitgeschakeld in deze keuze; inhoudelijke reden nog vastleggen.'}
                        </p>
                      ))}
                      {other.map((module) => (
                        <p key={module.id}>
                          <strong>{module.title}</strong> · Geen selectie of afzonderlijke
                          uitsluitingsgrond in dit plan.
                        </p>
                      ))}
                      {catalog?.banks.some((bank) => bank.coverage === 'scoped_selection') && (
                        <p>
                          Afgebakend brondeel: procesblokken buiten dit bestand zijn hier niet
                          beoordeeld. Raadpleeg de volledige private bronbank.
                        </p>
                      )}
                    </details>
                    <details>
                      <summary>Bronnen van deze keuze</summary>
                      {plan.sourceIds.map((id) => (
                        <p key={id}>
                          <strong>{id}</strong> ·{' '}
                          {String(sources.get(id)?.title ?? 'Bronomschrijving ontbreekt')}
                        </p>
                      ))}
                    </details>
                  </article>
                );
              })}
            </details>
          );
        })}
    </section>
  );
}
