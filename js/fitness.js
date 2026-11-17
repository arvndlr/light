// Home fitness: no-equipment exercise library, routines and the interval logic
// behind the guided workout player. Pure data + functions (unit-tested).

export const LEVELS = [
  { id: 'beginner', n: 'Beginner', work: 30, rest: 30 },
  { id: 'intermediate', n: 'Intermediate', work: 40, rest: 20 },
  { id: 'advanced', n: 'Advanced', work: 45, rest: 15 },
];
export const levelInfo = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0];
export const GROUPS = ['Chest & arms', 'Legs & glutes', 'Core', 'Back', 'Cardio', 'Mobility'];

/** reps = [beginner, intermediate, advanced] targets when doing the move outside a timed routine. */
export const EXERCISES = [
  { id: 'pushup', n: 'Push-ups', g: 'Chest & arms', reps: ['5–8 (knees OK)', '10–15', '20–25'], how: ['Hands under shoulders, body in one straight line.', 'Lower your chest to a fist above the floor.', 'Push the floor away until your arms are straight.'], tip: 'Squeeze your glutes so your hips don’t sag.' },
  { id: 'kneepush', n: 'Knee push-ups', g: 'Chest & arms', reps: ['8–10', '15', '20'], how: ['Knees on the floor, hands slightly wider than shoulders.', 'Keep a straight line from knees to head.', 'Lower slowly, push back up.'], tip: 'The best way to build up to full push-ups.' },
  { id: 'inclinepush', n: 'Incline push-ups', g: 'Chest & arms', reps: ['8–10', '15', '20'], how: ['Hands on a bed, table or sturdy chair.', 'Walk your feet back until your body is straight.', 'Lower your chest to the edge, then push up.'], tip: 'The higher the surface, the easier it gets.' },
  { id: 'diamond', n: 'Diamond push-ups', g: 'Chest & arms', reps: ['3–5 (knees)', '8–10', '12–15'], how: ['Make a diamond with your thumbs and index fingers under your chest.', 'Keep elbows close to your body.', 'Lower and push up with control.'], tip: 'Great for triceps — the back of your arms.' },
  { id: 'pike', n: 'Pike push-ups', g: 'Chest & arms', reps: ['5', '8–10', '12–15'], how: ['Start in a push-up, then lift your hips high (upside-down V).', 'Bend your elbows to bring your head toward the floor.', 'Press back up.'], tip: 'Builds strong shoulders without weights.' },
  { id: 'dips', n: 'Chair dips', g: 'Chest & arms', reps: ['6–8', '12', '15–20'], how: ['Hands on the edge of a sturdy chair behind you.', 'Bend your elbows to lower your hips.', 'Push back up until your arms are straight.'], tip: 'Keep your back close to the chair; bend knees to make it easier.' },
  { id: 'squat', n: 'Squats', g: 'Legs & glutes', reps: ['10–12', '20', '30'], how: ['Feet shoulder-width apart, toes slightly out.', 'Sit back and down like into a chair, chest up.', 'Drive through your heels to stand.'], tip: 'Knees follow your toes — don’t let them cave in.' },
  { id: 'lunge', n: 'Lunges', g: 'Legs & glutes', reps: ['6 / leg', '10 / leg', '15 / leg'], how: ['Step one foot forward.', 'Lower until both knees are about 90°.', 'Push back to standing; switch legs.'], tip: 'Keep your front knee over your ankle.' },
  { id: 'bridge', n: 'Glute bridges', g: 'Legs & glutes', reps: ['10', '15–20', '25 (one leg: 10)'], how: ['Lie on your back, knees bent, feet flat.', 'Squeeze your glutes and lift your hips.', 'Pause at the top, lower slowly.'], tip: 'Helps your posture and lower back.' },
  { id: 'wallsit', n: 'Wall sit', g: 'Legs & glutes', reps: ['20 s', '45 s', '90 s'], timed: true, how: ['Back flat against a wall.', 'Slide down until knees are at 90°.', 'Hold, breathing steadily.'], tip: 'It burns. That’s the point.' },
  { id: 'calf', n: 'Calf raises', g: 'Legs & glutes', reps: ['15', '25', '40 (one leg: 15)'], how: ['Stand tall, hold a wall for balance.', 'Rise onto your toes as high as you can.', 'Lower slowly.'], tip: 'Do them on a stair edge for a bigger stretch.' },
  { id: 'stepup', n: 'Step-ups', g: 'Legs & glutes', reps: ['8 / leg', '12 / leg', '20 / leg'], how: ['Use a stair or a very sturdy low chair.', 'Step up with one foot, drive through the heel.', 'Step down with control; switch legs.'], tip: 'Don’t push off with the back foot.' },
  { id: 'splitsquat', n: 'Bulgarian split squats', g: 'Legs & glutes', reps: ['5 / leg', '8 / leg', '12 / leg'], how: ['Rest the top of your back foot on a chair behind you.', 'Lower your back knee toward the floor.', 'Drive up through the front heel.'], tip: 'One of the best leg exercises you can do at home.' },
  { id: 'plank', n: 'Plank', g: 'Core', reps: ['20 s', '45 s', '90 s'], timed: true, how: ['Forearms on the floor, elbows under shoulders.', 'Body straight from head to heels.', 'Brace your stomach like someone’s about to poke it.'], tip: 'Quality over time — stop when your hips sag.' },
  { id: 'sideplank', n: 'Side plank', g: 'Core', reps: ['15 s / side', '30 s / side', '45 s / side'], timed: true, how: ['Lie on your side, forearm under shoulder.', 'Lift your hips into a straight line.', 'Hold, then switch sides.'], tip: 'Bend your bottom knee to make it easier.' },
  { id: 'climber', n: 'Mountain climbers', g: 'Cardio', reps: ['20 s', '40 s', '60 s'], timed: true, how: ['Start in a high plank.', 'Drive one knee toward your chest, then switch.', 'Keep your hips low and move fast.'], tip: 'Core and cardio in one move.' },
  { id: 'bicycle', n: 'Bicycle crunches', g: 'Core', reps: ['10 / side', '15 / side', '25 / side'], how: ['Lie on your back, hands lightly behind your head.', 'Bring opposite elbow toward opposite knee.', 'Extend the other leg; alternate.'], tip: 'Slow and controlled beats fast and sloppy.' },
  { id: 'legraise', n: 'Leg raises', g: 'Core', reps: ['6–8 (bent knees)', '12', '15–20'], how: ['Lie flat, hands under your hips.', 'Lift your legs to vertical.', 'Lower slowly without touching the floor.'], tip: 'Keep your lower back pressed down.' },
  { id: 'deadbug', n: 'Dead bug', g: 'Core', reps: ['6 / side', '10 / side', '15 / side'], how: ['Lie on your back, arms up, knees bent at 90°.', 'Lower opposite arm and leg toward the floor.', 'Return and switch sides.'], tip: 'Gentle on the back, tough on the core.' },
  { id: 'superman', n: 'Superman', g: 'Back', reps: ['8', '12', '20 (hold 3 s)'], how: ['Lie face down, arms stretched forward.', 'Lift arms, chest and legs off the floor.', 'Pause, then lower slowly.'], tip: 'Counters hours of slouching over a phone.' },
  { id: 'birddog', n: 'Bird-dog', g: 'Back', reps: ['6 / side', '10 / side', '15 / side'], how: ['On hands and knees.', 'Extend opposite arm and leg straight out.', 'Hold 2 seconds, switch sides.'], tip: 'Keep your hips level — imagine a glass of water on your back.' },
  { id: 'jacks', n: 'Jumping jacks', g: 'Cardio', reps: ['30 s', '60 s', '90 s'], timed: true, how: ['Jump your feet out while raising your arms.', 'Jump back to the start.', 'Keep a steady rhythm.'], tip: 'Low-impact version: step out instead of jumping.' },
  { id: 'highknees', n: 'High knees', g: 'Cardio', reps: ['20 s', '40 s', '60 s'], timed: true, how: ['Run in place.', 'Bring your knees up to hip height.', 'Pump your arms.'], tip: 'Land softly on the balls of your feet.' },
  { id: 'burpee', n: 'Burpees', g: 'Cardio', reps: ['5 (no jump)', '10', '15–20'], how: ['Squat down, hands on the floor.', 'Jump or step feet back into a plank.', 'Return, then stand or jump up.'], tip: 'The ultimate full-body move. Pace yourself.' },
  { id: 'boxing', n: 'Shadow boxing', g: 'Cardio', reps: ['30 s', '60 s', '90 s'], timed: true, how: ['Fighting stance, hands up by your face.', 'Throw quick jabs, crosses and hooks.', 'Stay light on your feet.'], tip: 'Great stress release too.' },
  { id: 'catcow', n: 'Cat-cow', g: 'Mobility', reps: ['30 s', '45 s', '60 s'], timed: true, how: ['On hands and knees.', 'Arch your back up (cat), then let your belly drop (cow).', 'Move with your breath.'], tip: 'Wakes up a stiff spine in the morning.' },
  { id: 'childpose', n: 'Child’s pose', g: 'Mobility', reps: ['30 s', '45 s', '60 s'], timed: true, how: ['Kneel, sit back on your heels.', 'Stretch your arms forward on the floor.', 'Breathe slowly into your back.'], tip: 'A calming stretch before sleep.' },
  { id: 'hipflexor', n: 'Hip flexor stretch', g: 'Mobility', reps: ['20 s / side', '30 s / side', '45 s / side'], timed: true, how: ['Kneel on one knee, other foot in front.', 'Gently push your hips forward.', 'Keep your chest tall; switch sides.'], tip: 'Undoes hours of sitting.' },
  { id: 'hamstring', n: 'Hamstring stretch', g: 'Mobility', reps: ['20 s / side', '30 s / side', '45 s / side'], timed: true, how: ['Sit with one leg straight.', 'Hinge forward from the hips toward your toes.', 'Breathe; switch legs.'], tip: 'Never bounce — ease into it.' },
  { id: 'chest', n: 'Doorway chest stretch', g: 'Mobility', reps: ['20 s', '30 s', '45 s'], timed: true, how: ['Forearms on both sides of a doorway.', 'Step forward until you feel a chest stretch.', 'Keep shoulders down.'], tip: 'Opens up “phone posture”.' },
  { id: 'neck', n: 'Chin tucks & neck rolls', g: 'Mobility', reps: ['30 s', '45 s', '60 s'], timed: true, how: ['Pull your chin straight back (double chin), hold 2 s.', 'Then slowly roll your neck side to side.', 'Keep shoulders relaxed.'], tip: 'Fixes forward-head posture from screens.' },
];
export const exercise = (id) => EXERCISES.find((e) => e.id === id);

/** Routines. stretch: true = continuous holds without rest. when = best time of day. */
export const WORKOUTS = [
  { id: 'wake', n: 'Morning wake-up', ic: '🌅', when: 'morning', rounds: 1, focus: 'Energy · mobility', moves: ['jacks', 'catcow', 'squat', 'kneepush', 'plank', 'hipflexor'], desc: 'Gentle full-body start that wakes you up better than coffee.' },
  { id: 'full', n: 'Full-body burn', ic: '🔥', when: 'any', rounds: 3, focus: 'Strength · fat burn', moves: ['squat', 'pushup', 'lunge', 'plank', 'bridge', 'climber'], desc: 'The all-rounder. Hits every major muscle.' },
  { id: 'core', n: 'Core blast', ic: '🎯', when: 'any', rounds: 2, focus: 'Abs · posture', moves: ['plank', 'bicycle', 'legraise', 'sideplank', 'deadbug', 'superman'], desc: 'A strong core = better posture and a stronger back.' },
  { id: 'upper', n: 'Upper body push', ic: '💪', when: 'any', rounds: 2, focus: 'Chest · shoulders · arms', moves: ['pushup', 'pike', 'dips', 'inclinepush', 'superman', 'plank'], desc: 'Build your chest, shoulders and arms with just your bodyweight.' },
  { id: 'legs', n: 'Legs & glutes', ic: '🦵', when: 'any', rounds: 2, focus: 'Legs · glutes', moves: ['squat', 'lunge', 'bridge', 'wallsit', 'calf', 'splitsquat'], desc: 'Strong legs burn the most calories and protect your knees.' },
  { id: 'cardio', n: 'Fat-burn cardio', ic: '⚡', when: 'any', rounds: 2, focus: 'Heart · stamina', moves: ['jacks', 'highknees', 'burpee', 'climber', 'boxing'], desc: 'Get your heart pumping. Sweat guaranteed.' },
  { id: 'desk', n: 'Desk-break stretch', ic: '🧘', when: 'afternoon', rounds: 1, stretch: true, focus: 'Posture · stiffness', moves: ['neck', 'chest', 'hipflexor', 'hamstring', 'catcow'], desc: 'Undo hours of sitting and phone posture in a few minutes.' },
  { id: 'night', n: 'Wind-down stretch', ic: '🌙', when: 'night', rounds: 1, stretch: true, focus: 'Relax · sleep', moves: ['childpose', 'catcow', 'hamstring', 'hipflexor', 'childpose'], desc: 'Slow stretches that tell your body it’s time to sleep.' },
];
export const workout = (id) => WORKOUTS.find((w) => w.id === id);
/** Weekly plan, Sunday = 0. */
export const WEEK_PLAN = ['night', 'full', 'cardio', 'upper', 'legs', 'full', 'core'];
const STRETCH_HOLD = { beginner: 30, intermediate: 40, advanced: 45 };

/** Flatten a routine into timed steps for the player: [{ ex, phase: 'work'|'rest'|'prep', secs, round }]. */
export function workoutSteps(w, level = 'beginner') {
  const L = levelInfo(level);
  const steps = [{ ex: w.moves[0], phase: 'prep', secs: 10, round: 1 }];
  for (let r = 1; r <= w.rounds; r++) {
    w.moves.forEach((ex, i) => {
      const last = r === w.rounds && i === w.moves.length - 1;
      if (w.stretch) steps.push({ ex, phase: 'work', secs: STRETCH_HOLD[L.id], round: r });
      else {
        steps.push({ ex, phase: 'work', secs: L.work, round: r });
        if (!last) steps.push({ ex: w.moves[(i + 1) % w.moves.length], phase: 'rest', secs: i === w.moves.length - 1 ? L.rest * 2 : L.rest, round: r });
      }
    });
  }
  return steps;
}
/** Total minutes for a routine at a level (rounded up). */
export const workoutMinutes = (w, level) => Math.ceil(workoutSteps(w, level).reduce((s, x) => s + x.secs, 0) / 60);

/** What to train today: time-of-day routines win in the morning/afternoon/night, otherwise the weekly plan. */
export function suggestWorkout({ weekday, minutesNow, wake, bed, doneIds = [] }) {
  const sinceWake = (minutesNow - wake + 1440) % 1440;
  const toBed = (bed - minutesNow + 1440) % 1440;
  const pick = (id) => (doneIds.includes(id) ? null : workout(id));
  if (toBed <= 120) return pick('night') || null;
  if (sinceWake <= 150) return pick('wake') || pick(WEEK_PLAN[weekday]);
  return pick(WEEK_PLAN[weekday]) || pick('desk') || null;
}
