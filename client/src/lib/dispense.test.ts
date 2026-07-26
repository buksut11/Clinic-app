// Checks for the sig parser and the inventory matcher. The project has no test
// runner, so this is a plain script: `npm run test:dispense` from client/.
// Nothing imports it, so it is typechecked but never bundled.
import { deriveQuantity, matchMedication, allergyHits, allergyCheck } from './dispense';
import { Medication, PrescriptionItem } from './types';

let pass = 0;
let fail = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++;
  else { fail++; console.log(`  FAIL ${label}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); }
};

const item = (dosage: string, frequency: string, duration: string, name = 'Drug'): PrescriptionItem =>
  ({ name, dosage, frequency, duration });

console.log('\n-- quantity derivation --');
// The two lines from the screenshot.
eq('1 tablet 3x daily 5 days', deriveQuantity(item('1 tablet', '3x daily', '5 days'), 'tablet').quantity, 15);
eq('1 capsule 2x daily 7 days', deriveQuantity(item('1 capsule', '2x daily', '7 days'), 'capsule').quantity, 14);
eq('math string', deriveQuantity(item('1 tablet', '3x daily', '5 days'), 'tablet').math, '1 × 3 × 5');

// Frequency vocabulary.
eq('tds', deriveQuantity(item('1 tab', 'TDS', '5 days'), 'tablet').quantity, 15);
eq('bd', deriveQuantity(item('1 tab', 'bd', '7 days'), 'tablet').quantity, 14);
eq('od', deriveQuantity(item('1 tab', 'OD', '28 days'), 'tablet').quantity, 28);
eq('qds', deriveQuantity(item('1 tab', 'qds', '5 days'), 'tablet').quantity, 20);
eq('q8h', deriveQuantity(item('1 tab', 'q8h', '5 days'), 'tablet').quantity, 15);
eq('every 6 hours', deriveQuantity(item('1 tab', 'every 6 hours', '3 days'), 'tablet').quantity, 12);
eq('three times a day', deriveQuantity(item('1 tab', 'three times a day', '5 days'), 'tablet').quantity, 15);
eq('twice daily', deriveQuantity(item('2 tabs', 'twice daily', '10 days'), 'tablet').quantity, 40);
eq('once daily', deriveQuantity(item('1 tab', 'once daily', '5 days'), 'tablet').quantity, 5);

// Duration vocabulary.
eq('1 week', deriveQuantity(item('1 tab', '2x daily', '1 week'), 'tablet').quantity, 14);
eq('2 weeks', deriveQuantity(item('1 tab', 'od', '2 weeks'), 'tablet').quantity, 14);
eq('5/7 shorthand', deriveQuantity(item('1 tab', 'tds', '5/7'), 'tablet').quantity, 15);
eq('bare number = days', deriveQuantity(item('1 tab', 'bd', '7'), 'tablet').quantity, 14);
eq('1 month', deriveQuantity(item('1 tab', 'od', '1 month'), 'tablet').quantity, 30);

// Fractional doses round up — a 7.5-tablet course still needs 8 in the bag.
eq('half tablet', deriveQuantity(item('1/2 tablet', '3x daily', '5 days'), 'tablet').quantity, 8);
eq('unicode half', deriveQuantity(item('½ tablet', 'bd', '10 days'), 'tablet').quantity, 10);

console.log('\n-- refuses to guess --');
// A strength is not a count: "500mg" of a 250mg tablet is two tablets, and
// nothing in the sig says so. Must fail rather than dispense 7500.
eq('strength as dosage -> null', deriveQuantity(item('500mg', '3x daily', '5 days'), 'tablet').quantity, null);
eq('strength reports missing dose', deriveQuantity(item('500mg', '3x daily', '5 days'), 'tablet').missing, ['dose']);
eq('prn -> null', deriveQuantity(item('1 tab', 'as needed', '5 days'), 'tablet').quantity, null);
eq('prn flagged', deriveQuantity(item('1 tab', 'PRN', '5 days'), 'tablet').asNeeded, true);
eq('ongoing duration -> null', deriveQuantity(item('1 tab', 'od', 'ongoing'), 'tablet').quantity, null);
eq('empty sig -> null', deriveQuantity(item('', '', ''), 'tablet').quantity, null);
eq('empty sig lists all three', deriveQuantity(item('', '', ''), 'tablet').missing, ['dose', 'frequency', 'duration']);
eq('gibberish frequency -> null', deriveQuantity(item('1 tab', 'as directed', '5 days'), 'tablet').quantity, null);

// Volume only counts when the product is actually sold in ml.
eq('10ml of a syrup sold in ml', deriveQuantity(item('10 ml', '2x daily', '7 days'), 'ml').quantity, 140);
eq('10ml of a product sold in bottles', deriveQuantity(item('10 ml', '2x daily', '7 days'), 'bottle').quantity, null);

console.log('\n-- matching --');
const med = (name: string, strength: string | null, generic: string | null, qty = 100, sku = 'SKU'): Medication =>
  ({ id: name + strength, sku, name, genericName: generic, form: 'tablet', strength, unit: 'tablet', quantity: qty,
     reorderLevel: 10, unitPrice: 1, costPrice: 1, isActive: true } as Medication);

const stock = [
  med('Paracetamol', '500mg', 'Acetaminophen', 759, 'PARA500'),
  med('Paracetamol', '250mg', 'Acetaminophen', 200, 'PARA250'),
  med('Amoxicillin', '500mg', null, 364, 'AMOX500'),
  med('Sodium valproate', '200mg', null, 50, 'VALP200'),
  med('Sodium chloride', '0.9%', null, 80, 'NACL09'),
];

const m1 = matchMedication({ name: 'Paracetamol 500mg' } as PrescriptionItem, stock);
eq('exact name+strength', [m1?.med.sku, m1?.tier, m1?.ambiguous], ['PARA500', 'exact', false]);

// The strength must decide between two products of the same drug.
const m2 = matchMedication({ name: 'Paracetamol 250mg' } as PrescriptionItem, stock);
eq('picks the right strength', m2?.med.sku, 'PARA250');

// A single shared first word must never auto-fill: "Sodium valproate" and
// "Sodium chloride" are one token apart.
const m3 = matchMedication({ name: 'Sodium valproate 200mg' } as PrescriptionItem, stock);
eq('valproate is exact, not confused', [m3?.med.sku, m3?.tier], ['VALP200', 'exact']);
const m4 = matchMedication({ name: 'Sodium bicarbonate' } as PrescriptionItem, stock);
eq('unknown sodium salt stays loose', m4?.tier, 'loose');

const m5 = matchMedication({ name: 'Amoxicillin' } as PrescriptionItem, stock);
eq('name-only exact match', [m5?.med.sku, m5?.tier], ['AMOX500', 'exact']);
eq('no match returns null', matchMedication({ name: 'Ibuprofen 400mg' } as PrescriptionItem, stock), null);

// Generic name on the prescription.
const m6 = matchMedication({ name: 'Acetaminophen' } as PrescriptionItem, stock);
eq('generic matches, ambiguous across strengths', m6?.ambiguous, true);

console.log('\n-- allergy check --');
eq('latex vs paracetamol', allergyHits('Latex', 'Paracetamol 500mg', 'Acetaminophen'), []);
eq('literal drug-name hit', allergyHits('Amoxicillin', 'Amoxicillin 500mg', null), ['Amoxicillin']);
eq('multi-value list', allergyHits('Latex, Penicillin', 'Penicillin V 250mg', null), ['Penicillin']);
eq('"none" ignored', allergyHits('None', 'Amoxicillin 500mg', null), []);
eq('empty ignored', allergyHits(null, 'Amoxicillin 500mg', null), []);

console.log('\n-- allergy check: drug class --');
// The cases a literal name match reads straight past.
eq('penicillin allergy catches amoxicillin', allergyHits('Penicillin', 'Amoxicillin 500mg', null), ['Penicillin']);
eq('aspirin allergy catches ibuprofen', allergyHits('Aspirin', 'Ibuprofen 400mg', null), ['Aspirin']);
eq('sulfa allergy catches co-trimoxazole', allergyHits('Sulfa', 'Co-trimoxazole 480mg', null), ['Sulfa']);
eq('class named directly', allergyHits('NSAIDs', 'Diclofenac 50mg', null), ['NSAIDs']);
eq('generic name carries the class', allergyHits('Penicillin', 'Amoxil', 'Amoxicillin'), ['Penicillin']);

// Cross-class is worth a mention but must say so in different words.
const cross = allergyCheck('Penicillin', 'Cefalexin 500mg', null);
eq('penicillin vs cephalosporin flags', cross.length, 1);
eq('cross-reaction is worded as such', cross[0].reason.includes('cross-react'), true);
eq('same-class is not worded as cross-reaction',
  allergyCheck('Aspirin', 'Naproxen 250mg', null)[0].reason.includes('same class'), true);

// A class must not leak into unrelated drugs.
eq('penicillin vs paracetamol', allergyHits('Penicillin', 'Paracetamol 500mg', 'Acetaminophen'), []);
eq('nsaid allergy vs an antibiotic', allergyHits('Ibuprofen', 'Amoxicillin 500mg', null), []);
eq('unknown allergen stays quiet', allergyHits('Shellfish', 'Ibuprofen 400mg', null), []);

// One flag per recorded term, however many ways it could fire.
eq('literal hit is not doubled by its own class', allergyCheck('Ibuprofen', 'Ibuprofen 400mg', null).length, 1);
eq('literal hit is reported as a name match', allergyCheck('Ibuprofen', 'Ibuprofen 400mg', null)[0].kind, 'name');
eq('class hit is reported as a class match', allergyCheck('Aspirin', 'Ibuprofen 400mg', null)[0].kind, 'class');

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) throw new Error(`${fail} dispense check(s) failed`);
