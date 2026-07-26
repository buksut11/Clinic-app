import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { api, errMsg } from '../../lib/api';
import { Medication, PendingPrescription, PrescriptionItem } from '../../lib/types';
import { Modal, useToast } from '../ui';
import { money, fmtDate } from '../../lib/format';
import { allergyCheck, deriveQuantity, matchMedication, MatchTier } from '../../lib/dispense';
import { IconCheck, IconSearch } from '../icons';

/** A line the pharmacist is actually dispensing. */
interface Line {
  medicationId: string;
  name: string;
  genericName?: string | null;
  unit: string;
  available: number;
  unitPrice: number;
  /** '' when the sig couldn't be read — an empty required field, never a guessed default. */
  quantity: number | '';
  /** Index of the prescription item this satisfies, or null for an off-prescription addition. */
  rxIndex: number | null;
  /** What the prescription works out to, for comparison against `quantity`. */
  prescribed: number | null;
  matchTier?: MatchTier;
}

/** One prescribed item, with everything we could work out about it. */
interface RxLine {
  item: PrescriptionItem;
  need: number | null;
  math: string | null;
  missing: string[];
  asNeeded: boolean;
  med: Medication | null;
  tier: MatchTier | null;
  ambiguous: boolean;
}

/** Measures and abbreviations don't take a plural 's' — "140 ml", not "140 mls". */
const NO_PLURAL = /^(ml|mls|mg|mcg|µg|g|kg|l|iu|cc|oz|%)$/i;
const plural = (n: number, unit: string) =>
  `${n} ${unit}${n === 1 || unit.endsWith('s') || NO_PLURAL.test(unit) ? '' : 's'}`;

/** Dispense.notes is VARCHAR(191). */
const NOTE_LIMIT = 191;

/**
 * The pharmacist's own words take priority; the generated deviation summary is
 * clipped to whatever room is left. Nothing is actually lost by clipping — the
 * sale stores its prescriptionId and per-item quantities, so the difference
 * stays reconstructable from the record itself.
 */
function composeNotes(own: string, deviations: string[]): string | null {
  const mine = own.trim();
  if (deviations.length === 0) return mine || null;
  const summary = `Differs from Rx: ${deviations.join('; ')}`;
  const sep = mine ? ' — ' : '';
  const room = NOTE_LIMIT - mine.length - sep.length;
  if (room < 24) return mine || null;
  return mine + sep + (summary.length > room ? summary.slice(0, room - 1) + '…' : summary);
}

function lineFrom(m: Medication, rxIndex: number | null, prescribed: number | null, tier?: MatchTier): Line {
  return {
    medicationId: m.id,
    name: `${m.name}${m.strength ? ' ' + m.strength : ''}`,
    genericName: m.genericName,
    unit: m.unit,
    available: m.quantity,
    unitPrice: m.unitPrice,
    quantity: prescribed ?? '',
    rxIndex,
    prescribed,
    matchTier: tier,
  };
}

/**
 * Wraps the dispensing form in whichever container the caller needs. A walk-in
 * sale is an occasional interruption and stays a dialog; dispensing against a
 * prescription is the repeated core task, and putting that behind an
 * open-and-close cycle taxes every single sale, so the Sell tab renders the
 * same form inline beside the queue. One form, two frames.
 */
function Shell({
  inline,
  onClose,
  title,
  header,
  footerLead,
  footer,
  children,
}: {
  inline: boolean;
  onClose: () => void;
  title: string;
  header?: ReactNode;
  footerLead: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  if (!inline) {
    return (
      <Modal open onClose={onClose} wide="xl" title={title} header={header} footerLead={footerLead} footer={footer}>
        {children}
      </Modal>
    );
  }
  return (
    <section className="card overflow-hidden" aria-label={title}>
      {header && <div className="border-b border-white/55 px-5 py-4">{header}</div>}
      <div className="px-5 py-5">{children}</div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/55 bg-white/30 px-5 py-4">
        {footerLead}
        <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
      </div>
    </section>
  );
}

export default function DispenseModal({
  prescription,
  onClose,
  onDispensed,
  inline = false,
}: {
  prescription: PendingPrescription | null;
  onClose: () => void;
  onDispensed: () => void;
  /** Render inside the page instead of as a dialog. Used by the Sell tab. */
  inline?: boolean;
}) {
  const toast = useToast();
  const [allMeds, setAllMeds] = useState<Medication[]>([]);
  const [rxLines, setRxLines] = useState<RxLine[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [payment, setPayment] = useState<'cash' | 'card' | 'invoice'>('cash');
  const [ackDeviation, setAckDeviation] = useState(false);
  const [ackAllergy, setAckAllergy] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/pharmacy/medications').then((r) => {
      const meds: Medication[] = r.data;
      setAllMeds(meds);
      if (!prescription) return;

      // Every prescribed item is carried into state, matched or not. An item can
      // be left undispensed deliberately, but it must never disappear quietly.
      const rl: RxLine[] = [];
      const cart: Line[] = [];
      prescription.items.forEach((item, idx) => {
        const match = matchMedication(item, meds);
        const sig = deriveQuantity(item, match?.med.unit);
        rl.push({
          item,
          need: sig.quantity,
          math: sig.math,
          missing: sig.missing,
          asNeeded: sig.asNeeded,
          med: match?.med ?? null,
          tier: match?.tier ?? null,
          ambiguous: !!match?.ambiguous,
        });
        // Only confident, unambiguous, in-stock matches are pre-filled. A loose
        // name hit is offered as a suggestion the pharmacist has to accept.
        const confident = match && (match.tier === 'exact' || match.tier === 'strong') && !match.ambiguous;
        if (confident && match.med.quantity > 0 && !cart.some((l) => l.medicationId === match.med.id)) {
          cart.push(lineFrom(match.med, idx, sig.quantity, match.tier));
        }
      });
      setRxLines(rl);
      setLines(cart);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- search -------------------------------------------------------------
  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allMeds
      .filter((m) => m.isActive)
      .filter((m) => m.name.toLowerCase().includes(q) || (m.genericName || '').toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
      .filter((m) => !lines.some((l) => l.medicationId === m.id))
      .slice(0, 6);
  }, [search, allMeds, lines]);

  useEffect(() => setActive(0), [search]);

  const addMed = (m: Medication, rxIndex: number | null = null, prescribed: number | null = null, tier?: MatchTier) => {
    if (m.quantity <= 0) return;
    setLines((s) => (s.some((l) => l.medicationId === m.id) ? s : [...s, lineFrom(m, rxIndex, prescribed, tier)]));
    setSearch('');
    searchRef.current?.focus();
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      if (e.key === 'Escape' && search) { setSearch(''); setSearchOpen(false); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); const m = results[active]; if (m && m.quantity > 0) addMed(m); }
    else if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); }
  };

  const setQty = (i: number, raw: string) => {
    const q = raw === '' ? '' : Math.max(0, Math.floor(Number(raw) || 0));
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, quantity: q } : l)));
  };
  const bumpQty = (i: number, delta: number) =>
    setLines((s) => s.map((l, idx) => (idx === i ? { ...l, quantity: Math.max(1, (typeof l.quantity === 'number' ? l.quantity : 0) + delta) } : l)));
  const remove = (i: number) => setLines((s) => s.filter((_, idx) => idx !== i));

  // ---- reconciliation -----------------------------------------------------
  const qtyOf = (l: Line) => (typeof l.quantity === 'number' ? l.quantity : 0);
  const total = lines.reduce((s, l) => s + l.unitPrice * qtyOf(l), 0);
  const units = lines.reduce((s, l) => s + qtyOf(l), 0);

  const lineError = (l: Line): string | null => {
    if (l.quantity === '') return 'Enter a quantity';
    if (qtyOf(l) < 1) return 'Quantity must be at least 1';
    if (qtyOf(l) > l.available) return `Only ${plural(l.available, l.unit)} in stock`;
    return null;
  };
  const invalid = lines.filter((l) => lineError(l));

  /** Everything that differs from what was prescribed, named so the pharmacist can check it. */
  const deviations = useMemo(() => {
    if (!prescription) return [];
    const out: string[] = [];
    rxLines.forEach((rl, i) => {
      const line = lines.find((l) => l.rxIndex === i);
      if (!line) { out.push(`${rl.item.name} — not being dispensed`); return; }
      if (rl.need != null && line.quantity !== '' && qtyOf(line) !== rl.need) {
        out.push(`${rl.item.name} — dispensing ${qtyOf(line)} of ${plural(rl.need, line.unit)}`);
      }
    });
    return out;
  }, [rxLines, lines, prescription]);

  const allergyFlags = useMemo(
    () =>
      lines
        .map((l) => ({ line: l, flags: allergyCheck(prescription?.patient.allergies, l.name, l.genericName) }))
        .filter((x) => x.flags.length > 0),
    [lines, prescription]
  );

  useEffect(() => { if (deviations.length === 0) setAckDeviation(false); }, [deviations.length]);
  useEffect(() => { if (allergyFlags.length === 0) setAckAllergy(false); }, [allergyFlags.length]);

  // Invoicing charges a registered patient; only available when a prescription (patient) is linked.
  const canInvoice = !!prescription;
  const effectivePayment = payment === 'invoice' && !canInvoice ? 'cash' : payment;

  const blockReason =
    lines.length === 0 ? 'Add at least one medication'
    : invalid.length > 0 ? `${invalid[0].name} — ${lineError(invalid[0])!.toLowerCase()}`
    : allergyFlags.length > 0 && !ackAllergy ? 'Confirm the allergy warning below'
    : deviations.length > 0 && !ackDeviation ? 'Confirm the differences from the prescription'
    : null;

  const submit = async () => {
    if (blockReason) { toast(blockReason, 'error'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/pharmacy/dispense', {
        patientId: prescription?.patient.id || null,
        prescriptionId: prescription?.id || null,
        customerName: prescription ? null : customerName || null,
        customerPhone: prescription ? null : customerPhone || null,
        paymentMethod: effectivePayment,
        // Deviations belong in the record, not just on the screen.
        notes: composeNotes(notes, deviations),
        items: lines.map((l) => ({ medicationId: l.medicationId, quantity: qtyOf(l) })),
      });
      toast(data.invoice ? `Sold — invoice ${data.invoice.invoiceNo} raised` : 'Sale recorded successfully', 'success');
      onDispensed();
    } catch (err) {
      toast(errMsg(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ---- prescription rail --------------------------------------------------
  const rxStatus = (rl: RxLine, i: number): { label: string; tone: string } => {
    const line = lines.find((l) => l.rxIndex === i);
    if (line) {
      if (line.quantity === '') return { label: 'Needs quantity', tone: 'bg-amber-500/15 text-amber-700' };
      // A line that can't actually be dispensed isn't filled, whatever the number says.
      if (lineError(line)) return { label: 'Check quantity', tone: 'bg-red-500/15 text-red-700' };
      if (rl.need != null && qtyOf(line) < rl.need) return { label: 'Short fill', tone: 'bg-amber-500/15 text-amber-700' };
      if (rl.need != null && qtyOf(line) > rl.need) return { label: 'Over', tone: 'bg-amber-500/15 text-amber-700' };
      return { label: 'Filled', tone: 'bg-brand-500/15 text-brand-700' };
    }
    if (!rl.med) return { label: 'Not in inventory', tone: 'bg-slate-500/15 text-slate-600' };
    if (rl.med.quantity <= 0) return { label: 'Out of stock', tone: 'bg-amber-500/15 text-amber-700' };
    if (rl.tier === 'loose' || rl.ambiguous) return { label: 'Check match', tone: 'bg-amber-500/15 text-amber-700' };
    return { label: 'Not dispensed', tone: 'bg-slate-500/15 text-slate-600' };
  };

  const searchFor = (name: string) => { setSearch(name); setSearchOpen(true); searchRef.current?.focus(); };

  const listOpen = searchOpen && search.trim().length > 0;

  const allergies = prescription?.patient.allergies;
  const hasAllergy = !!allergies && allergies.trim().toLowerCase() !== 'none';

  return (
    <Shell
      inline={inline}
      onClose={onClose}
      title={prescription ? `Sell / dispense — ${prescription.patient.fullName}` : 'Sell medicines (walk-in customer)'}
      header={
        prescription ? (
          <div>
            <p className="eyebrow tracking-[0.16em] text-brand-700">Dispense against prescription</p>
            <h3 className="mt-1 text-lg font-bold text-slate-800">{prescription.patient.fullName}</h3>
            <p className="mt-1 text-xs meta">
              <span className="font-semibold">{prescription.patient.patientNo}</span>
              {prescription.doctor?.name ? ` · Dr. ${prescription.doctor.name}` : ''} · {fmtDate(prescription.createdAt)}
            </p>
          </div>
        ) : undefined
      }
      footerLead={
        <div>
          <div className="eyebrow">
            {lines.length === 1 ? '1 item' : `${lines.length} items`} · {units} {units === 1 ? 'unit' : 'units'}
          </div>
          <div className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">{money(total)}</div>
          {blockReason && <p className="mt-0.5 text-xs font-semibold text-amber-700">{blockReason}</p>}
        </div>
      }
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>{inline ? 'Close' : 'Cancel'}</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving || !!blockReason}>
            {saving ? 'Saving…' : `Confirm sale · ${money(total)}`}
          </button>
        </>
      }
    >
      {/* The one thing on this screen that can put someone in hospital goes first,
          full width, above every input. A recorded allergy that clears the check
          still gets a line — silence there is indistinguishable from a check
          that never ran. */}
      {hasAllergy && (
        allergyFlags.length > 0 ? (
          <div className="flag-in mb-5 flex items-start gap-3 rounded-2xl border border-red-400/55 bg-red-50/85 px-3.5 py-3">
            <svg className="mt-0.5 h-[18px] w-[18px] flex-shrink-0 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m10.29 3.86-8.47 14.14A2 2 0 0 0 3.53 21h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" /><path d="M12 17h.01" />
            </svg>
            <div>
              <p className="text-sm font-bold leading-snug text-red-800">
                {allergyFlags.length === 1 ? 'One item conflicts' : `${allergyFlags.length} items conflict`} with the recorded {allergies} allergy
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                Marked in red below. Dispensing is held until a pharmacist confirms it is safe to proceed.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border border-white/70 bg-white/45 px-3.5 py-2.5">
            <IconCheck className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand-700" />
            <p className="text-xs meta">
              <span className="font-semibold text-slate-700">Recorded allergy: {allergies}.</span>{' '}
              {lines.length === 0
                ? 'Every item added below is checked against it by name and drug class.'
                : `Checked against ${lines.length === 1 ? 'the item' : `all ${lines.length} items`} below by name and drug class — no conflicts found. Still check the packaging and any dressings.`}
            </p>
          </div>
        )
      )}

      {/* Written out in full, both branches: Tailwind scans for whole class
          names and never sees one that was concatenated at runtime. */}
      <div
        className={
          !prescription
            ? ''
            : inline
            ? 'grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]'
            : 'grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]'
        }
      >
        {/* ---- Prescribed (source of truth) ---- */}
        {prescription && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-400/25 pb-2">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Prescribed</h4>
              <span className="text-[11px] tabular-nums text-slate-400">
                {rxLines.length} {rxLines.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {rxLines.map((rl, i) => {
              const status = rxStatus(rl, i);
              const line = lines.find((l) => l.rxIndex === i);
              const unmatched = !line;
              return (
                <div
                  key={i}
                  className={`mb-2 rounded-2xl border p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] ${
                    unmatched ? 'border-amber-500/40 bg-amber-50/70' : 'border-white/85 bg-white/55'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13.5px] font-semibold tracking-tight text-slate-800">{rl.item.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[rl.item.dosage, rl.item.frequency, rl.item.duration].filter(Boolean).join(' · ') || 'No sig recorded'}
                      </p>
                      {rl.item.instructions && <p className="mt-0.5 text-xs italic text-slate-400">{rl.item.instructions}</p>}
                    </div>
                    <span className={`badge flex-shrink-0 ${status.tone}`}>{status.label}</span>
                  </div>

                  {/* The derived quantity always shows its working — an automated
                      number is only safe to trust if it can be checked at a glance. */}
                  {rl.need != null ? (
                    <div className="mt-2.5 flex items-baseline justify-between gap-2 border-t border-dashed border-slate-400/30 pt-2">
                      <span className="text-[13px] font-semibold tabular-nums text-brand-700">
                        {plural(rl.need, rl.med?.unit || 'unit')}
                      </span>
                      <span className="font-mono text-[10.5px] tabular-nums text-slate-400">{rl.math}</span>
                    </div>
                  ) : (
                    <p className="mt-2.5 border-t border-dashed border-slate-400/30 pt-2 text-xs font-medium text-amber-700">
                      {rl.asNeeded
                        ? 'Taken as needed — set the quantity manually.'
                        : `Couldn't read the ${rl.missing.join(' or ')} — set the quantity manually.`}
                    </p>
                  )}

                  {unmatched && rl.med && rl.med.quantity > 0 && (
                    <button
                      type="button"
                      className="mt-2 text-[11.5px] font-semibold text-brand-700 underline underline-offset-2"
                      onClick={() => addMed(rl.med!, i, rl.need, rl.tier ?? undefined)}
                    >
                      {rl.tier === 'loose' || rl.ambiguous
                        ? `Did you mean ${rl.med.name}${rl.med.strength ? ' ' + rl.med.strength : ''}? Add it`
                        : `Add ${rl.med.name}${rl.med.strength ? ' ' + rl.med.strength : ''}`}
                    </button>
                  )}
                  {unmatched && (!rl.med || rl.med.quantity <= 0) && (
                    <button
                      type="button"
                      className="mt-2 text-[11.5px] font-semibold text-brand-700 underline underline-offset-2"
                      onClick={() => searchFor(rl.item.name)}
                    >
                      Search inventory manually
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ---- Dispensing ---- */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-400/25 pb-2">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Dispensing</h4>
            <span className="text-[11px] tabular-nums text-slate-400">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          </div>

          <div className="relative mb-3">
            <IconSearch className="pointer-events-none absolute start-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              className="input ps-9"
              role="combobox"
              aria-expanded={listOpen}
              aria-controls="dispense-search-results"
              aria-activedescendant={listOpen && results[active] ? `dispense-opt-${results[active].id}` : undefined}
              aria-autocomplete="list"
              aria-label="Add medication from inventory"
              placeholder="Add medication — name, generic or SKU"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={onSearchKey}
            />
            {listOpen && (
              // `data-floating-panel` tells Modal that Escape belongs to this
              // dropdown first, so closing the list doesn't close the dialog.
              <div
                id="dispense-search-results"
                data-floating-panel
                role="listbox"
                className="glass-strong absolute z-10 mt-1 w-full overflow-hidden rounded-2xl p-1.5 shadow-2xl"
              >
                {results.length === 0 && (
                  <p className="px-3 py-2 text-sm text-slate-400">No medication matches “{search.trim()}”.</p>
                )}
                {results.map((m, i) => {
                  const out = m.quantity <= 0;
                  return (
                    <button
                      key={m.id}
                      id={`dispense-opt-${m.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      disabled={out}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => addMed(m)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start text-sm transition ${
                        out ? 'cursor-not-allowed opacity-50' : i === active ? 'bg-white/80' : 'hover:bg-white/70'
                      }`}
                    >
                      <span className="min-w-0 truncate text-slate-700">
                        {m.name} {m.strength}
                        {m.genericName && <span className="text-xs text-slate-400"> {m.genericName}</span>}
                      </span>
                      <span className={`flex-shrink-0 text-xs ${out ? 'font-semibold text-red-600' : 'text-slate-400'}`}>
                        {out ? 'Out of stock' : plural(m.quantity, m.unit)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-400/35 py-8 text-center text-sm text-slate-400">
              Nothing added yet. Search above to add medications.
            </p>
          ) : (
            lines.map((l, i) => {
              const err = lineError(l);
              const overStock = l.quantity !== '' && qtyOf(l) > l.available;
              const flagged = allergyCheck(allergies, l.name, l.genericName);
              const short = l.prescribed != null && l.quantity !== '' && qtyOf(l) !== l.prescribed;
              return (
                <div
                  key={l.medicationId}
                  className={`mb-2 flex items-center gap-3 rounded-2xl border p-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9)] ${
                    err || flagged.length ? 'flag-in border-red-400/55 bg-red-50/60' : short ? 'border-amber-500/45 bg-amber-50/60' : 'border-white/80 bg-white/50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold tracking-tight text-slate-800">{l.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-slate-500">
                      {l.rxIndex != null ? (
                        <span className="badge bg-brand-500/15 text-brand-700">Rx {l.rxIndex + 1}</span>
                      ) : prescription ? (
                        <span className="badge bg-slate-500/15 text-slate-600">Off-Rx</span>
                      ) : null}
                      {l.matchTier === 'loose' && <span className="font-semibold text-amber-700">Check this match</span>}
                      {/* The stock error already names the figure — don't print it twice. */}
                      {!overStock && <span>{plural(l.available, l.unit)} in stock</span>}
                      {err && <span className="font-semibold text-red-700">{err}</span>}
                      {!err && short && (
                        <button
                          type="button"
                          className="font-semibold text-amber-700 underline underline-offset-2"
                          onClick={() => setLines((s) => s.map((x, idx) => (idx === i ? { ...x, quantity: x.prescribed! } : x)))}
                        >
                          Prescribed {l.prescribed} — use that
                        </button>
                      )}
                    </div>
                    {/* Naming the reason is the whole point — "matches allergy"
                        tells a pharmacist to go and look it up again. */}
                    {flagged.map((f) => (
                      <p key={f.term} className="mt-1 text-[11.5px] font-semibold leading-snug text-red-700">
                        ⚠ {f.reason}
                      </p>
                    ))}
                  </div>

                  <div className="flex flex-shrink-0 items-center overflow-hidden rounded-full border border-slate-400/40 bg-white/75">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${l.name}`}
                      className="flex h-8 w-[30px] items-center justify-center text-slate-600 transition hover:bg-white disabled:opacity-30"
                      disabled={qtyOf(l) <= 1}
                      onClick={() => bumpQty(i, -1)}
                    >
                      −
                    </button>
                    <input
                      className="h-8 w-11 border-0 bg-transparent text-center text-[13.5px] font-semibold tabular-nums text-slate-800 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={l.available}
                      aria-label={`Quantity of ${l.name}`}
                      aria-invalid={!!err}
                      value={l.quantity}
                      onChange={(e) => setQty(i, e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${l.name}`}
                      className="flex h-8 w-[30px] items-center justify-center text-slate-600 transition hover:bg-white disabled:opacity-30"
                      disabled={qtyOf(l) >= l.available}
                      onClick={() => bumpQty(i, 1)}
                    >
                      +
                    </button>
                  </div>

                  <div className="w-[70px] flex-shrink-0 text-end">
                    <div className="font-mono text-[10px] tabular-nums text-slate-400">{l.unitPrice.toFixed(2)} ea</div>
                    <div className="text-[13.5px] font-semibold tabular-nums text-slate-700">{(l.unitPrice * qtyOf(l)).toFixed(2)}</div>
                  </div>

                  <button
                    type="button"
                    aria-label={`Remove ${l.name}`}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-white/70 hover:text-red-600"
                    onClick={() => remove(i)}
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}

          {/* Walk-in customer details (only when there is no linked prescription/patient) */}
          {!prescription && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className="label">Customer name (optional)</label><input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Walk-in customer" /></div>
              <div><label className="label">Customer phone (optional)</label><input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Contact number" /></div>
            </div>
          )}

          <div className="mt-5">
            <div className="segmented flex w-full">
              {([
                ['cash', 'Cash'],
                ['card', 'Card'],
                ['invoice', 'Charge to invoice'],
              ] as const).map(([key, label]) => {
                const disabled = key === 'invoice' && !canInvoice;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    aria-pressed={payment === key}
                    onClick={() => setPayment(key)}
                    className={`flex-1 whitespace-nowrap px-2 text-[12.5px] ${payment === key && !disabled ? 'is-active' : ''} ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-400">
              {payment === 'invoice' && canInvoice
                ? 'Raises an unpaid invoice on the patient’s account that reception can collect.'
                : !canInvoice
                ? 'Invoicing needs a registered patient — walk-in sales are paid at the counter.'
                : 'Paid at the counter now.'}
            </p>
          </div>

          {showNotes ? (
            <div className="mt-4">
              <label className="label" htmlFor="dispense-notes">Dispensing note</label>
              <input id="dispense-notes" autoFocus className="input" maxLength={NOTE_LIMIT} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Counselled patient on dosage" />
            </div>
          ) : (
            <button type="button" className="mt-4 text-[12.5px] font-semibold text-brand-700" onClick={() => setShowNotes(true)}>
              ＋ Add a dispensing note
            </button>
          )}
        </div>
      </div>

      {/* ---- Acknowledgements: a deviation can happen, but only deliberately ---- */}
      {allergyFlags.length > 0 && (
        <label className="mt-5 flex items-start gap-2.5 rounded-2xl border border-red-400/55 bg-red-50/70 p-3 text-sm text-red-800">
          <input type="checkbox" className="mt-0.5 h-4 w-4 flex-shrink-0 accent-red-600" checked={ackAllergy} onChange={(e) => setAckAllergy(e.target.checked)} />
          <span>
            <b className="font-semibold">{allergyFlags.length === 1 ? 'One item conflicts' : `${allergyFlags.length} items conflict`} with this patient’s recorded allergy.</b>{' '}
            {allergyFlags.map((f) => f.line.name).join(', ')}. I have checked this and it is safe to dispense.
          </span>
        </label>
      )}

      {deviations.length > 0 && (
        <label className="mt-3 flex items-start gap-2.5 rounded-2xl border border-amber-500/45 bg-amber-50/70 p-3 text-sm text-amber-900">
          <input type="checkbox" className="mt-0.5 h-4 w-4 flex-shrink-0 accent-amber-600" checked={ackDeviation} onChange={(e) => setAckDeviation(e.target.checked)} />
          <span>
            <b className="font-semibold">This sale differs from the prescription.</b> {deviations.join('; ')}. Dispense as entered — the difference is recorded on the sale.
          </span>
        </label>
      )}

      <p aria-live="polite" className="sr-only">{blockReason || `Ready to confirm. ${units} units, ${money(total)}.`}</p>
    </Shell>
  );
}
