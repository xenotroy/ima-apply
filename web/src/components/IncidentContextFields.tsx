import type { WorkspaceIncident, WorkspaceState } from '../data/model';
import {
  incidentKindLabels,
  incidentKinds,
  isIsoOffsetLexeme,
  type IncidentKind,
} from '../domain/incident-context';
import { Field } from './Primitives';

export interface IncidentContextFieldsProps {
  value: WorkspaceIncident;
  onChange: (patch: Partial<WorkspaceIncident>) => void;
  workspace: WorkspaceState;
}
function Links({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: string; title: string }[];
  selected?: string[];
  onChange: (ids: string[]) => void;
}) {
  const values = selected ?? [];
  const choices = [
    ...items,
    ...values
      .filter((id) => !items.some((item) => item.id === id))
      .map((id) => ({ id, title: `Ontbrekende of niet-passende koppeling [${id}]` })),
  ];
  return (
    <fieldset className="link-choices">
      <legend>{label}</legend>
      {choices.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={values.includes(item.id)}
            onChange={(event) =>
              onChange(
                event.target.checked ? [...values, item.id] : values.filter((id) => id !== item.id),
              )
            }
          />
          {item.title}
        </label>
      ))}
      {!choices.length && <small>Nog geen records beschikbaar.</small>}
    </fieldset>
  );
}
/** Fully controlled: rendering absent source fields never inserts defaults into the record. */
export function IncidentContextFields({ value, onChange, workspace }: IncidentContextFieldsProps) {
  return (
    <section aria-label="Aanvullende incidentcontext">
      <p className="muted">Vul de afzonderlijk bekende incidentgegevens en koppelingen in.</p>
      <div className="form-grid">
        <Field label="Incidentsoort">
          <select
            value={value.kind ?? ''}
            onChange={(event) =>
              onChange({
                kind: event.target.value ? (event.target.value as IncidentKind) : undefined,
              })
            }
          >
            <option value="">Niet afzonderlijk vastgelegd</option>
            {incidentKinds.map((kind) => (
              <option key={kind} value={kind}>
                {incidentKindLabels[kind]}
              </option>
            ))}
          </select>
        </Field>
        {(
          [
            ['occurredAt', 'Tijdstip gebeurtenis'],
            ['reportedAt', 'Tijdstip melding'],
            ['sourceCreatedAt', 'Oorspronkelijk aangemaakt op'],
            ['sourceUpdatedAt', 'Oorspronkelijk gewijzigd op'],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            hint="ISO met offset, bijvoorbeeld 2026-10-11T09:30:00.1234567+02:00"
          >
            <input
              type="text"
              aria-label={label}
              value={value[key] ?? ''}
              placeholder="Niet afzonderlijk vastgelegd"
              onChange={(event) => {
                const entered = event.target.value;
                onChange({
                  [key]: entered || undefined,
                  ...(key === 'occurredAt' && isIsoOffsetLexeme(entered)
                    ? { date: entered.slice(0, 10) }
                    : {}),
                });
              }}
            />
          </Field>
        ))}
        {(
          [
            ['scopeId', 'Oorspronkelijk scope-ID'],
            ['organisation', 'Organisatie (brontekst)'],
            ['location', 'Locatie (brontekst)'],
            ['status', 'Incidentstatus (brontekst)'],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              value={value[key] ?? ''}
              onChange={(event) => onChange({ [key]: event.target.value })}
            />
          </Field>
        ))}
      </div>
      <Field label="Tags" hint="Eén tag per regel.">
        <textarea
          rows={2}
          value={value.tags?.join('\n') ?? ''}
          onChange={(event) =>
            onChange({ tags: event.target.value === '' ? [] : event.target.value.split(/\r?\n/) })
          }
        />
      </Field>
      <Links
        label="Incidentonderwerpen"
        selected={value.topicIds}
        items={(workspace.topics ?? []).map((item) => ({ id: item.id, title: item.title }))}
        onChange={(topicIds) => onChange({ topicIds })}
      />
      <Links
        label="BRF-definitieversies"
        selected={value.basisRiskFactorIds}
        items={(workspace.basisRiskFactorRecords ?? []).map((item) => ({
          id: item.id,
          title: `${item.code} · ${item.title} · versie ${item.version} [${item.id}] · ${item.status}`,
        }))}
        onChange={(basisRiskFactorIds) => onChange({ basisRiskFactorIds })}
      />
      <Links
        label="Incidentbewijs"
        selected={value.evidenceIds}
        items={(workspace.evidence ?? []).map((item) => ({ id: item.id, title: item.title }))}
        onChange={(evidenceIds) => onChange({ evidenceIds })}
      />
      <Links
        label="Incidentonderzoeken"
        selected={value.investigationIds}
        items={(workspace.investigations ?? [])
          .filter((item) => item.incidentId === value.id)
          .map((item) => ({ id: item.id, title: item.title }))}
        onChange={(investigationIds) => onChange({ investigationIds })}
      />
    </section>
  );
}
export default IncidentContextFields;
