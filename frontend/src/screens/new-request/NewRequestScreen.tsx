import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  getMember,
  searchIcd10,
  searchModifiers,
  searchNappi,
  searchNetworkProviders,
  searchTariff,
  submitAuthorisation,
} from '../../api/client';
import type {
  Icd10SearchResult,
  MemberLookupResult,
  ModifierSearchResult,
  NappiSearchResult,
  NetworkProviderSearchResult,
  TariffSearchResult,
} from '../../api/types';
import { CodeAutocomplete } from '../../components/CodeAutocomplete';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearOf(dateIso: string): number {
  const y = Number.parseInt(dateIso.slice(0, 4), 10);
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

/**
 * Screen 1 — New authorisation request (Implementation Companion §C.2).
 * Fields grouped by the gate they feed; every coded field autocompletes
 * against reference data (CodeAutocomplete), Enter submits, invalid/
 * missing codes are flagged inline before submit.
 */
export function NewRequestScreen() {
  const navigate = useNavigate();

  const [memberId, setMemberId] = useState('');
  const [member, setMember] = useState<MemberLookupResult | null>(null);
  const [memberLookupError, setMemberLookupError] = useState<string | null>(null);
  const [dependantCode, setDependantCode] = useState('');

  const [icd10, setIcd10] = useState<Icd10SearchResult | null>(null);
  const [tariff, setTariff] = useState<TariffSearchResult | null>(null);
  const [nappi, setNappi] = useState<NappiSearchResult | null>(null);
  const [modifier, setModifier] = useState<ModifierSearchResult | null>(null);

  const [provider, setProvider] = useState<NetworkProviderSearchResult | null>(null);
  const [serviceDate, setServiceDate] = useState(todayIso());
  const [setting, setSetting] = useState<'IN_HOSPITAL' | 'OUT_HOSPITAL'>('OUT_HOSPITAL');

  const [losDays, setLosDays] = useState('');
  const [levelOfCare, setLevelOfCare] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [preAuthLeadHours, setPreAuthLeadHours] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [hasReferral, setHasReferral] = useState(false);
  const [quotedAmount, setQuotedAmount] = useState('');
  const [dispensingIsDsp, setDispensingIsDsp] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; details?: string[] } | null>(null);

  const year = yearOf(serviceDate);

  async function lookupMember(id: string) {
    setMemberLookupError(null);
    setMember(null);
    if (!id.trim()) {
      return;
    }
    try {
      const result = await getMember(id.trim(), serviceDate);
      setMember(result);
    } catch (err) {
      setMemberLookupError(err instanceof ApiError ? err.message : 'Lookup failed');
    }
  }

  const canSubmit = memberId.trim().length > 0 && icd10 !== null && tariff !== null && serviceDate.length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!icd10 || !tariff) {
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const decision = await submitAuthorisation({
        memberId: memberId.trim(),
        dependantCode: dependantCode.trim() || undefined,
        icd10Code: icd10.code,
        tariffCode: tariff.code,
        nappiCode: nappi?.nappiCode,
        modifierCode: modifier?.code,
        practiceNo: provider?.practiceNo,
        serviceDate,
        setting,
        requestedLengthOfStayDays: setting === 'IN_HOSPITAL' && losDays ? Number(losDays) : undefined,
        requestedLevelOfCare: setting === 'IN_HOSPITAL' ? levelOfCare.trim() || undefined : undefined,
        preAuthLeadHours: preAuthLeadHours ? Number(preAuthLeadHours) : undefined,
        isEmergency: isEmergency || undefined,
        hasReferral: showAdvanced ? hasReferral : undefined,
        quotedAmount: quotedAmount ? Number(quotedAmount) : undefined,
        dispensingIsDsp: nappi ? dispensingIsDsp : undefined,
      });
      navigate(`/decision/${decision.auth_id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError({ message: err.message, details: err.details });
      } else {
        setSubmitError({ message: 'Failed to submit authorisation request' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>New authorisation request</h1>

      {submitError && (
        <div className="error-banner">
          <strong>{submitError.message}</strong>
          {submitError.details && (
            <ul>
              {submitError.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <fieldset>
        <legend>Member</legend>
        <div className="field-group">
          <div className="field">
            <label htmlFor="memberId">Membership no. *</label>
            <input
              id="memberId"
              value={memberId}
              onChange={(e) => {
                setMemberId(e.target.value);
                setMember(null);
              }}
              onBlur={() => lookupMember(memberId)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="dependantCode">Dependant code</label>
            <input id="dependantCode" value={dependantCode} onChange={(e) => setDependantCode(e.target.value)} />
          </div>
        </div>
        {memberLookupError && <p className="field-error">{memberLookupError}</p>}
        {member && (
          <p className="field-hint">
            {member.optionName ?? member.optionCode} ·{' '}
            <span className={`badge ${member.status === 'ACTIVE' ? 'badge-active' : 'badge-inactive'}`}>{member.status}</span>{' '}
            · benefit year {member.benefitYear}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend>Clinical</legend>
        <div className="field-group">
          <CodeAutocomplete<Icd10SearchResult>
            id="icd10"
            label="ICD-10"
            required
            search={(q) => searchIcd10(q, year)}
            getCode={(r) => r.code}
            getLabel={(r) => `${r.code} — ${r.description}`}
            onSelect={setIcd10}
          />
          <CodeAutocomplete<TariffSearchResult>
            id="tariff"
            label="Procedure / tariff code"
            required
            search={(q) => searchTariff(q, year)}
            getCode={(r) => r.code}
            getLabel={(r) => `${r.code} — ${r.description}`}
            onSelect={setTariff}
          />
          <CodeAutocomplete<NappiSearchResult>
            id="nappi"
            label="NAPPI (if medicine)"
            search={(q) => searchNappi(q, year)}
            getCode={(r) => r.nappiCode}
            getLabel={(r) => `${r.nappiCode} — ${r.product}`}
            onSelect={setNappi}
          />
        </div>
        <p className="field-hint">
          {icd10 && (icd10.isPmb ? 'PMB condition' : 'Not a PMB condition')}
          {icd10 && tariff && ' · '}
          {tariff && (tariff.requiresPreauth ? 'Requires pre-authorisation' : 'No pre-authorisation required')}
          {nappi && ` · ${nappi.formularyFlag ? 'On formulary' : 'Off formulary'}`}
        </p>
      </fieldset>

      <fieldset>
        <legend>Service</legend>
        <div className="field-group">
          <CodeAutocomplete<NetworkProviderSearchResult>
            id="provider"
            label="Facility / provider practice no."
            search={(q) => searchNetworkProviders(q, year)}
            getCode={(r) => r.practiceNo}
            getLabel={(r) => `${r.practiceNo} — ${r.providerType}`}
            onSelect={setProvider}
          />
          <div className="field">
            <label htmlFor="serviceDate">Date of service *</label>
            <input id="serviceDate" type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="setting">Setting *</label>
            <select id="setting" value={setting} onChange={(e) => setSetting(e.target.value as 'IN_HOSPITAL' | 'OUT_HOSPITAL')}>
              <option value="OUT_HOSPITAL">Out-of-hospital</option>
              <option value="IN_HOSPITAL">In-hospital</option>
            </select>
          </div>
        </div>
        {provider && <p className="field-hint">Network status: {provider.networkMembership}</p>}
      </fieldset>

      {setting === 'IN_HOSPITAL' && (
        <fieldset>
          <legend>Admission</legend>
          <div className="field-group">
            <div className="field">
              <label htmlFor="losDays">Requested length of stay (days)</label>
              <input id="losDays" type="number" min="0" value={losDays} onChange={(e) => setLosDays(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="levelOfCare">Level of care</label>
              <input id="levelOfCare" value={levelOfCare} onChange={(e) => setLevelOfCare(e.target.value)} placeholder="e.g. general ward" />
            </div>
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>
          <button type="button" className="secondary" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? 'Hide' : 'Show'} co-payment factors
          </button>
        </legend>
        {showAdvanced && (
          <div className="field-group">
            <CodeAutocomplete<ModifierSearchResult>
              id="modifier"
              label="Modifier code"
              search={(q) => searchModifiers(q, year)}
              getCode={(r) => r.code}
              getLabel={(r) => `${r.code} — ${r.effectRule}`}
              onSelect={setModifier}
            />
            <div className="field">
              <label htmlFor="preAuthLeadHours">Notice given before service (hours)</label>
              <input id="preAuthLeadHours" type="number" min="0" value={preAuthLeadHours} onChange={(e) => setPreAuthLeadHours(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="quotedAmount">Quoted amount (R)</label>
              <input id="quotedAmount" type="number" min="0" step="0.01" value={quotedAmount} onChange={(e) => setQuotedAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="isEmergency">Emergency</label>
              <input id="isEmergency" type="checkbox" checked={isEmergency} onChange={(e) => setIsEmergency(e.target.checked)} />
            </div>
            <div className="field">
              <label htmlFor="hasReferral">FP/GP referral on file</label>
              <input id="hasReferral" type="checkbox" checked={hasReferral} onChange={(e) => setHasReferral(e.target.checked)} />
            </div>
            {nappi && (
              <div className="field">
                <label htmlFor="dispensingIsDsp">Dispensed at DSP pharmacy</label>
                <input id="dispensingIsDsp" type="checkbox" checked={dispensingIsDsp} onChange={(e) => setDispensingIsDsp(e.target.checked)} />
              </div>
            )}
          </div>
        )}
      </fieldset>

      <div className="button-row">
        <button type="submit" disabled={!canSubmit}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}
