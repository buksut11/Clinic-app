import { Medication, PrescriptionItem } from './types';

// ---------------------------------------------------------------------------
// Deriving a dispensing quantity from a prescription's sig
//
// Doctors type dosage/frequency/duration as free text (Consultation.tsx), so
// pharmacy has to interpret prose rather than read a number. Everything here is
// therefore best-effort and fails LOUDLY: when any part of the sig can't be
// read with confidence the quantity comes back null and the pharmacist types it
// in. A blank required field stops the sale; a confident wrong default doesn't.
// ---------------------------------------------------------------------------

export interface SigQuantity {
  /** Units to dispense, or null when the sig couldn't be read. */
  quantity: number | null;
  /** Compact arithmetic for the UI, e.g. "1 × 3 × 5". */
  math: string | null;
  /** Long form, e.g. "1 tablet × 3 daily × 5 days". */
  detail: string | null;
  /** Which parts failed to parse: 'dose' | 'frequency' | 'duration'. */
  missing: string[];
  /** Sig says "as needed", so a course quantity is meaningless. */
  asNeeded: boolean;
}

const UNICODE_FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Units that count discrete things we can multiply out. */
const COUNT_UNITS = /\b(tab|tabs|tablet|tablets|cap|caps|capsule|capsules|pill|pills|piece|pieces|sachet|sachets|patch|patches|puff|puffs|drop|drops|spray|sprays|supp|suppository|suppositories|vial|vials|amp|ampoule|ampoules|dose|doses|unit|units)\b/;
/** A number followed by one of these is a *strength*, not a count of things. */
const STRENGTH_UNITS = /\b(mg|mcg|µg|ug|g|gram|grams|iu|%)\b/;
const VOLUME_UNITS = /\b(ml|mls|millilitre|millilitres|l|litre|litres|cc)\b/;

// Vulgar-fraction glyphs survive normalisation — "½ tablet" is a real dose.
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9./%×½¼¾⅓⅔\s-]/g, ' ').replace(/\s+/g, ' ').trim();

function leadingNumber(s: string): number | null {
  for (const [glyph, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(glyph)) return v;
  }
  // A vulgar fraction, but only the plausible dosing ones — this must not eat
  // the "5/7" (= 5 days) shorthand that shows up in duration fields.
  const frac = s.match(/(\d+)\s*\/\s*([234])\b/);
  if (frac && Number(frac[1]) < Number(frac[2])) return Number(frac[1]) / Number(frac[2]);
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * How many units make up one dose. `medUnit` decides whether a volume in the
 * sig is dispensable: "10 ml" is a dose when the item is sold in ml, and
 * uninterpretable when it is sold in bottles.
 *
 * A strength ("500mg") is deliberately NOT a dose — working out how many 250mg
 * tablets make a 500mg dose needs the product strength and is exactly the kind
 * of inference that should stay with a human.
 */
function parseDose(dosage: string | null | undefined, medUnit?: string): number | null {
  const s = norm(dosage || '');
  if (!s) return null;
  const n = leadingNumber(s);
  if (n === null || n <= 0) return null;

  // What sits immediately after the number tells us what the number means.
  const after = s.slice(s.search(/\d/)).replace(/^[\d./½¼¾⅓⅔\s-]+/, '');
  const unitWord = after.split(' ')[0] || '';

  if (COUNT_UNITS.test(unitWord)) return n;
  if (STRENGTH_UNITS.test(unitWord)) return null;
  if (VOLUME_UNITS.test(unitWord)) {
    const mu = (medUnit || '').toLowerCase();
    return mu === 'ml' || mu === 'l' || VOLUME_UNITS.test(mu) ? n : null;
  }
  // Bare number in a field labelled "dosage" — a count.
  if (!unitWord) return n;
  // Some other word (e.g. "1 spoonful"): treat as one countable dose unit.
  return n;
}

const FREQ_WORDS: [RegExp, number][] = [
  [/\b(qid|qds)\b/, 4],
  [/\b(tid|tds|td)\b/, 3],
  [/\b(bid|bd|bds)\b/, 2],
  [/\b(od|qd|om|on|mane|nocte|nightly|bedtime)\b/, 1],
  [/\bfour times\b/, 4],
  [/\b(three times|thrice)\b/, 3],
  [/\b(two times|twice)\b/, 2],
  [/\bonce\b/, 1],
];

/** Doses per day, or null when unreadable. */
function parseFrequency(frequency: string | null | undefined): { perDay: number | null; asNeeded: boolean } {
  const s = norm(frequency || '');
  if (!s) return { perDay: null, asNeeded: false };
  if (/\b(prn|as needed|as required|when required|if needed|sos)\b/.test(s)) return { perDay: null, asNeeded: true };

  // "every 8 hours" / "q8h" / "8 hourly"
  const hourly = s.match(/(?:every|q)\s*(\d+)\s*(?:h|hr|hrs|hour|hours|hourly)\b/) || s.match(/(\d+)\s*hourly\b/);
  if (hourly) {
    const h = Number(hourly[1]);
    if (h > 0 && h <= 24) return { perDay: 24 / h, asNeeded: false };
  }
  if (/\b(every other day|alternate days?|eod)\b/.test(s)) return { perDay: 0.5, asNeeded: false };
  if (/\b(weekly|once a week|every week)\b/.test(s)) return { perDay: 1 / 7, asNeeded: false };

  // "3x daily", "3 times a day", "3/day", "x3"
  const n = s.match(/(\d+)\s*(?:x|times?|\/)\s*(?:a\s+|per\s+)?(?:day|daily|d)\b/)
    || s.match(/^x?\s*(\d+)\s*x?\b/)
    || s.match(/\bx\s*(\d+)\b/);
  if (n) {
    const v = Number(n[1]);
    if (v > 0 && v <= 24) return { perDay: v, asNeeded: false };
  }

  for (const [re, v] of FREQ_WORDS) if (re.test(s)) return { perDay: v, asNeeded: false };
  if (/\bdaily\b/.test(s)) return { perDay: 1, asNeeded: false };
  return { perDay: null, asNeeded: false };
}

/** Course length in days, or null when unreadable/open-ended. */
function parseDuration(duration: string | null | undefined): number | null {
  const s = norm(duration || '');
  if (!s) return null;
  if (/\b(ongoing|continuous|indefinite|until reviewed|until finished|prn|as needed|long term)\b/.test(s)) return null;

  // UK shorthand: n/7 = n days, n/52 = n weeks, n/12 = n months.
  const shorthand = s.match(/(\d+)\s*\/\s*(7|52|12)\b/);
  if (shorthand) {
    const n = Number(shorthand[1]);
    const per = shorthand[2];
    return per === '7' ? n : per === '52' ? n * 7 : n * 30;
  }
  const m = s.match(/(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|wk|wks|w|month|months|mo)\b/);
  if (m) {
    const n = Number(m[1]);
    const u = m[2];
    if (/^d/.test(u)) return n;
    if (/^w/.test(u)) return n * 7;
    return n * 30;
  }
  // A bare number in a field labelled "duration" means days.
  const bare = s.match(/^(\d+)$/);
  return bare ? Number(bare[1]) : null;
}

export function deriveQuantity(item: PrescriptionItem, medUnit?: string): SigQuantity {
  const dose = parseDose(item.dosage, medUnit);
  const { perDay, asNeeded } = parseFrequency(item.frequency);
  const days = parseDuration(item.duration);

  const missing: string[] = [];
  if (dose === null) missing.push('dose');
  if (perDay === null) missing.push('frequency');
  if (days === null) missing.push('duration');

  if (dose === null || perDay === null || days === null) {
    return { quantity: null, math: null, detail: null, missing, asNeeded };
  }

  // Round up: a course that works out at 7.5 tablets still needs 8 in the bag.
  const quantity = Math.max(1, Math.ceil(dose * perDay * days));
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
  return {
    quantity,
    math: `${fmt(dose)} × ${fmt(perDay)} × ${fmt(days)}`,
    detail: `${fmt(dose)} per dose × ${fmt(perDay)} daily × ${fmt(days)} days`,
    missing,
    asNeeded,
  };
}

// ---------------------------------------------------------------------------
// Matching a prescribed name to an inventory item
//
// Tiered on purpose. Only 'exact' and 'strong' are safe to add to the sale
// unprompted; a 'loose' hit is offered as a suggestion the pharmacist accepts,
// because a single shared first word is all it takes to confuse two different
// drugs ("Sodium valproate" / "Sodium chloride").
// ---------------------------------------------------------------------------

export type MatchTier = 'exact' | 'strong' | 'loose';

export interface MedMatch {
  med: Medication;
  tier: MatchTier;
  /** More than one candidate tied at this tier — never auto-fill. */
  ambiguous: boolean;
}

const nameNorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
const strengthOf = (s: string) => {
  const m = s.toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|ug|g|ml|iu)\b/);
  return m ? `${Number(m[1])}${m[2] === 'µg' || m[2] === 'ug' ? 'mcg' : m[2]}` : null;
};
const containsPhrase = (haystack: string, needle: string) =>
  needle.length >= 4 && new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(haystack);

export function matchMedication(item: PrescriptionItem, meds: Medication[]): MedMatch | null {
  const rx = nameNorm(item.name || '');
  if (!rx) return null;
  const rxStrength = strengthOf(item.name || '');

  const scored: { med: Medication; tier: MatchTier }[] = [];

  for (const med of meds) {
    if (!med.isActive) continue;
    const name = nameNorm(med.name);
    const generic = nameNorm(med.genericName || '');
    const full = nameNorm(`${med.name} ${med.strength || ''}`);
    const sku = nameNorm(med.sku);
    const medStrength = med.strength ? strengthOf(med.strength) : null;

    // Name+strength or SKU is definitive; nothing below can override it.
    if (rx === full || rx === sku) {
      scored.push({ med, tier: 'exact' });
      continue;
    }

    const nameExact = rx === name || (!!generic && rx === generic);
    const namePhrase = containsPhrase(rx, name) || (!!generic && containsPhrase(rx, generic));
    const firstToken = rx.split(' ')[0];
    const nameLoose = firstToken.length >= 4 && (name.includes(firstToken) || generic.includes(firstToken));

    // The strength check only ever *demotes* a product the name already
    // reached — it must not drag in unrelated drugs that merely differ in mg.
    if (!nameExact && !namePhrase && !nameLoose) continue;

    // Same drug, different strength: 500mg and 250mg are different dispensing
    // decisions, so this needs a human rather than an auto-fill.
    if (rxStrength && medStrength && rxStrength !== medStrength) {
      scored.push({ med, tier: 'loose' });
      continue;
    }
    scored.push({ med, tier: nameExact ? 'exact' : namePhrase ? 'strong' : 'loose' });
  }

  if (scored.length === 0) return null;
  const order: MatchTier[] = ['exact', 'strong', 'loose'];
  for (const tier of order) {
    const at = scored.filter((s) => s.tier === tier);
    if (at.length === 0) continue;
    return { med: at[0].med, tier, ambiguous: at.length > 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Allergy cross-check
//
// Two passes. The first is a literal name check: the recorded allergy text
// against the product and generic names. The second walks a small curated
// class table, so that a recorded penicillin allergy still catches amoxicillin
// and a recorded aspirin allergy still catches ibuprofen — the cases a literal
// check reads straight past.
//
// The table is deliberately short and covers the classes a general clinic
// actually stocks. It is a prompt, not a formulary: every flag warns, none of
// them decide, and the pharmacist's own knowledge remains the real control.
// Anything the table doesn't know about simply doesn't fire, which is why the
// literal check stays as the floor underneath it.
// ---------------------------------------------------------------------------

interface DrugClass {
  id: string;
  /** How the class is named in the warning, e.g. "an NSAID". */
  article: string;
  /** Allergy words that name the class itself rather than a member drug. */
  terms: string[];
  members: string[];
  /** Classes that share enough structure to be worth mentioning. */
  crossReacts?: string[];
}

const DRUG_CLASSES: DrugClass[] = [
  {
    id: 'penicillin',
    article: 'a penicillin',
    terms: ['penicillin', 'penicillins', 'beta lactam', 'betalactam'],
    members: ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'flucloxacillin', 'cloxacillin',
      'co amoxiclav', 'coamoxiclav', 'augmentin', 'piperacillin', 'benzylpenicillin', 'phenoxymethylpenicillin'],
    crossReacts: ['cephalosporin'],
  },
  {
    id: 'cephalosporin',
    article: 'a cephalosporin',
    terms: ['cephalosporin', 'cephalosporins'],
    members: ['cefalexin', 'cephalexin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefaclor', 'ceftazidime', 'cefdinir'],
    crossReacts: ['penicillin'],
  },
  {
    id: 'nsaid',
    article: 'an NSAID',
    terms: ['nsaid', 'nsaids', 'salicylate', 'salicylates'],
    members: ['aspirin', 'acetylsalicylic', 'ibuprofen', 'naproxen', 'diclofenac', 'ketoprofen', 'ketorolac',
      'indomethacin', 'indometacin', 'meloxicam', 'piroxicam', 'celecoxib', 'mefenamic'],
  },
  {
    id: 'sulfonamide',
    article: 'a sulfonamide',
    terms: ['sulfa', 'sulpha', 'sulfonamide', 'sulfonamides', 'sulphonamide'],
    members: ['sulfamethoxazole', 'co trimoxazole', 'cotrimoxazole', 'trimethoprim sulfamethoxazole',
      'sulfasalazine', 'sulfadiazine'],
  },
  {
    id: 'macrolide',
    article: 'a macrolide',
    terms: ['macrolide', 'macrolides'],
    members: ['erythromycin', 'azithromycin', 'clarithromycin'],
  },
  {
    id: 'quinolone',
    article: 'a fluoroquinolone',
    terms: ['quinolone', 'quinolones', 'fluoroquinolone', 'fluoroquinolones'],
    members: ['ciprofloxacin', 'levofloxacin', 'ofloxacin', 'moxifloxacin', 'norfloxacin'],
  },
  {
    id: 'tetracycline',
    article: 'a tetracycline',
    terms: ['tetracycline', 'tetracyclines'],
    members: ['tetracycline', 'doxycycline', 'minocycline', 'oxytetracycline'],
  },
  {
    id: 'opioid',
    article: 'an opioid',
    terms: ['opiate', 'opiates', 'opioid', 'opioids'],
    members: ['codeine', 'dihydrocodeine', 'morphine', 'tramadol', 'oxycodone', 'fentanyl', 'pethidine'],
  },
  {
    id: 'statin',
    article: 'a statin',
    terms: ['statin', 'statins'],
    members: ['atorvastatin', 'simvastatin', 'rosuvastatin', 'pravastatin'],
  },
  {
    id: 'ace',
    article: 'an ACE inhibitor',
    terms: ['ace inhibitor', 'ace inhibitors'],
    members: ['lisinopril', 'ramipril', 'enalapril', 'captopril', 'perindopril'],
  },
];

export interface AllergyFlag {
  /** The recorded allergy term that fired, exactly as the patient record spells it. */
  term: string;
  /** 'name' — the product literally is the allergen. 'class' — same or related drug class. */
  kind: 'name' | 'class';
  /** One sentence a pharmacist can act on, ready to show verbatim. */
  reason: string;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every class the text names, whether by class name or by a member drug. */
function classesNamed(text: string): DrugClass[] {
  return DRUG_CLASSES.filter(
    (c) => c.terms.some((t) => text.includes(t)) || c.members.some((m) => text.includes(m))
  );
}

/** Every class the product belongs to, with the member name that placed it there. */
function classesOf(product: string): { cls: DrugClass; member: string }[] {
  const out: { cls: DrugClass; member: string }[] = [];
  for (const cls of DRUG_CLASSES) {
    const member = cls.members.find((m) => product.includes(m));
    if (member) out.push({ cls, member });
  }
  return out;
}

/**
 * Checks one product against a patient's recorded allergies. At most one flag
 * per recorded term, because a pharmacist needs to know *that* aspirin is a
 * problem here, not that it is a problem three different ways.
 */
export function allergyCheck(
  allergies: string | null | undefined,
  name: string,
  generic?: string | null
): AllergyFlag[] {
  const raw = (allergies || '').trim();
  if (!raw || raw.toLowerCase() === 'none') return [];

  const product = nameNorm(`${name} ${generic || ''}`);
  const productClasses = classesOf(product);
  const flags: AllergyFlag[] = [];

  const terms = raw
    .split(/[,;/|]+|\band\b/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);

  for (const term of terms) {
    const t = nameNorm(term);
    if (!t) continue;

    // Literal first — it needs no table and never mis-explains itself.
    if (product.includes(t)) {
      flags.push({ term, kind: 'name', reason: `${name} contains the recorded allergen ${term}.` });
      continue;
    }
    if (productClasses.length === 0) continue;

    const termClasses = classesNamed(t);
    if (termClasses.length === 0) continue;

    const same = productClasses.find((p) => termClasses.some((tc) => tc.id === p.cls.id));
    if (same) {
      flags.push({
        term,
        kind: 'class',
        reason: `${cap(same.member)} is ${same.cls.article}, the same class as the recorded ${term} allergy.`,
      });
      continue;
    }

    const cross = productClasses.find((p) => termClasses.some((tc) => tc.crossReacts?.includes(p.cls.id)));
    if (cross) {
      flags.push({
        term,
        kind: 'class',
        reason: `${cap(cross.member)} is ${cross.cls.article}, which can cross-react with the recorded ${term} allergy.`,
      });
    }
  }

  return flags;
}

/** Terms only — kept for callers that just need to know whether anything fired. */
export function allergyHits(allergies: string | null | undefined, name: string, generic?: string | null): string[] {
  return allergyCheck(allergies, name, generic).map((f) => f.term);
}
