// Grow → Health: immunity habits + asthma self-care. General, mainstream guidance
// (in line with common asthma guidelines) — NOT medical advice. Pure data + logic.

export const DISCLAIMER = 'General information, not medical advice. Always follow your doctor’s asthma action plan and the instructions for your own medicines.';

/** Emergency warning signs — shown prominently. */
export const RED_FLAGS = [
  'Your reliever inhaler isn’t helping, or you need it again within a few hours',
  'You’re too breathless to speak in full sentences, walk or eat',
  'Lips, face or fingertips look blue or gray',
  'The skin between your ribs or at your neck sucks in when you breathe',
  'You feel very drowsy, confused or exhausted from breathing',
];
export const EMERGENCY = 'Use your reliever as your action plan says and get emergency help now — call 911 (Philippines) or go to the nearest emergency room. Don’t drive yourself.';

/** Everyday habits that support a healthy immune system. ic = emoji token (rendered as a line icon where mapped). */
export const IMMUNITY = [
  { ic: '😴', t: 'Sleep 7–9 hours', b: 'Short sleep weakens immune defenses. Consistent sleep is one of the strongest things you can do.' },
  { ic: '🥗', t: 'Eat the rainbow', b: 'Fruits, vegetables, beans and whole grains supply vitamin C, zinc, fiber and antioxidants your immune system uses.' },
  { ic: '🍳', t: 'Enough protein', b: 'Eggs, fish, chicken, tofu and beans help your body build immune cells and repair tissue.' },
  { ic: '💧', t: 'Stay hydrated', b: 'Water keeps the mucus in your airways thin, helping your body clear germs.' },
  { ic: '🏃', t: 'Move most days', b: 'Regular moderate exercise supports immune function. Very intense training without recovery can do the opposite.' },
  { ic: '🧼', t: 'Wash your hands', b: '20 seconds with soap — before eating and after being outside. It prevents many of the colds that trigger asthma flares.' },
  { ic: '💉', t: 'Stay up to date on vaccines', b: 'A yearly flu vaccine is generally recommended for people with asthma. Ask your doctor which others you need.' },
  { ic: '🚭', t: 'Avoid smoke and vapes', b: 'Smoking, vaping and second-hand smoke damage airways and weaken defenses against infection.' },
  { ic: '☀️', t: 'Get some daylight', b: 'Sunlight helps your body make vitamin D. Ask your doctor before taking supplements.' },
  { ic: '🌊', t: 'Manage stress', b: 'Long-term stress suppresses immunity and can trigger asthma symptoms. Breathing exercises and walks help.' },
];

/** Asthma basics: daily management. */
export const ASTHMA_BASICS = [
  { ic: '📝', t: 'Have a written asthma action plan', b: 'It tells you what to take every day, what to do when symptoms get worse, and when to get emergency help. Ask your doctor for one if you don’t have it.' },
  { ic: '🫁', t: 'Take your preventer as prescribed', b: 'Controller (preventer) inhalers calm airway inflammation over time. Keep taking them even when you feel fine — unless your doctor tells you otherwise.' },
  { ic: '🎒', t: 'Always carry your reliever', b: 'Keep your reliever inhaler with you — in your bag, at work, when exercising.' },
  { ic: '🎯', t: 'Check your inhaler technique', b: 'Many people use inhalers incorrectly, so less medicine reaches the lungs. Ask your doctor or pharmacist to watch you use it. Use a spacer if one was prescribed.' },
  { ic: '🪥', t: 'Rinse after steroid inhalers', b: 'Rinse your mouth and spit after using an inhaled steroid to help prevent thrush and hoarseness.' },
  { ic: '🗓️', t: 'Review with your doctor regularly', b: 'If you need your reliever often, wake up at night from asthma, or symptoms limit what you do, your treatment may need adjusting.' },
];

/** Common triggers with practical tips (including Philippine context). */
export const TRIGGERS = [
  { ic: '🛏️', t: 'Dust mites', b: 'Wash sheets and pillowcases weekly in hot water. Use dust-mite covers if you can. Keep stuffed toys and clutter out of the bedroom.' },
  { ic: '🍄', t: 'Mold & dampness', b: 'In the rainy season, ventilate rooms, fix leaks and dry damp clothes quickly. Clean visible mold with gloves and a mask.' },
  { ic: '🚬', t: 'Smoke', b: 'Avoid cigarette and vape smoke, burning trash, incense and mosquito coils. Cook with good ventilation.' },
  { ic: '🚗', t: 'Air pollution', b: 'On hazy, high-traffic days, limit outdoor exercise and consider a well-fitting mask.' },
  { ic: '🐱', t: 'Pet dander', b: 'If pets trigger you, keep them out of the bedroom and wash your hands after touching them.' },
  { ic: '🌸', t: 'Pollen & strong scents', b: 'Strong perfumes, air fresheners and cleaning sprays can irritate airways. Choose unscented products.' },
  { ic: '🤧', t: 'Colds & flu', b: 'Respiratory infections are one of the most common causes of asthma flares — the immunity habits above really matter.' },
  { ic: '❄️', t: 'Cold air & sudden change', b: 'Moving from heat into strong aircon or cold air can trigger symptoms. Cover your nose and mouth with a scarf in cold air.' },
  { ic: '😤', t: 'Strong emotions', b: 'Laughing hard, crying or stress can trigger symptoms in some people. Slow breathing helps.' },
];

/** Exercising safely with asthma — regular exercise usually helps asthma. */
export const EXERCISE_TIPS = [
  'Warm up for at least 10 minutes — gentle warm-ups reduce exercise-triggered symptoms.',
  'If your doctor recommends it, use your reliever 15 minutes before exercise.',
  'Breathe through your nose when you can — it warms and humidifies the air.',
  'Avoid exercising outdoors on high-pollution or very cold days; use Light’s home workouts instead.',
  'Start gentle (walking, cycling, swimming) and build up gradually.',
  'Stop and use your reliever if you get wheezy, tight-chested or very breathless.',
];

export const FOODS = {
  more: [
    'Fruits and vegetables every day (aim for half your plate)',
    'Fatty fish like sardines, tuna, salmon or galunggong (omega-3)',
    'Beans, lentils, nuts and seeds',
    'Whole grains — brown rice, oats',
    'Plenty of water',
  ],
  less: [
    'Ultra-processed and fried fast food',
    'Sugary drinks and soda',
    'Excess salt',
    'Foods you are actually allergic to (only avoid what’s confirmed for you)',
    'Some people react to sulfites (in some dried fruit, wine, processed foods) — notice your own pattern',
  ],
};

export const MYTHS = [
  { m: 'Inhalers are addictive.', f: 'Asthma inhalers are not addictive. Needing your reliever more often is a sign your asthma needs attention — not addiction.' },
  { m: 'If I feel fine, I can stop my preventer.', f: 'Preventers work in the background. Stopping them can let inflammation return. Only change medicines with your doctor.' },
  { m: 'People with asthma shouldn’t exercise.', f: 'With good control and the right precautions, regular exercise usually improves fitness and asthma. Many elite athletes have asthma.' },
  { m: 'Asthma is only a childhood problem.', f: 'Asthma can start or continue at any age. It’s a long-term condition that you manage, not just outgrow.' },
];

/** Guided breathing patterns (seconds). Gentle — no long breath-holds. */
export const BREATHING = [
  { id: 'belly', n: 'Belly breathing', ic: '🫁', mins: 2, inhale: 4, hold: 0, exhale: 6, d: 'One hand on your chest, one on your belly. Breathe in through your nose so only your belly rises, then breathe out slowly.' },
  { id: 'pursed', n: 'Pursed-lip breathing', ic: '🌊', mins: 2, inhale: 2, hold: 0, exhale: 4, d: 'Breathe in through your nose for 2, then out through gently pursed lips (like blowing a candle) for 4. Helps slow your breathing when you feel breathless.' },
  { id: 'calm', n: 'Calm-down breathing', ic: '🧘', mins: 3, inhale: 4, hold: 1, exhale: 6, d: 'Slow, steady breaths with a longer exhale to relax your body and mind. Great before sleep or when stressed.' },
];
export const breathing = (id) => BREATHING.find((b) => b.id === id);

export const SYMPTOMS = ['None', 'Mild', 'Moderate', 'Severe'];

/**
 * Simple 7-day asthma check, modeled on common guideline questions: daytime symptoms or reliever
 * use more than twice a week, any night waking, or any severe day suggest asthma may not be well controlled.
 * @param {Array<{ puffs?: number, sym?: number, night?: boolean } | undefined>} logs one entry per day (undefined = not logged)
 */
export function asthmaControl(logs) {
  const days = logs.filter(Boolean);
  if (!days.length) return { status: 'unknown', logged: 0, relieverDays: 0, symptomDays: 0, nightDays: 0, severeDays: 0 };
  const relieverDays = days.filter((d) => (d.puffs || 0) > 0).length;
  const symptomDays = days.filter((d) => (d.sym || 0) > 0).length;
  const nightDays = days.filter((d) => d.night).length;
  const severeDays = days.filter((d) => (d.sym || 0) >= 3).length;
  const status = severeDays > 0 || relieverDays > 2 || symptomDays > 2 || nightDays > 0 ? 'check' : 'good';
  return { status, logged: days.length, relieverDays, symptomDays, nightDays, severeDays };
}
