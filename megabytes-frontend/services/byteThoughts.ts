const RARE_THOUGHT_CHANCE = 0.08;

const RARE_POOL = [
  '[ByteName] is pretending to understand what is happening and somehow it works.',
  '[ByteName] pinged something it definitely should not have pinged.',
  '[ByteName] found a file marked DO NOT OPEN and now it is curious.',
  '[ByteName] is 72% sure it is the main character.',
  '[ByteName] is looking at you like you are the one with low stats.',
  '[ByteName] is running vibes.exe and refuses to explain.',
  '[ByteName] is buffering... but emotionally.',
  '[ByteName] solved a problem and immediately forgot how.',
  '[ByteName] is questioning its build path mid-run.',
  '[ByteName] is experiencing a bug and calling it a feature.',
  '[ByteName] is trying to speedrun existence.',
  '[ByteName] is holding it together with pure code and attitude.',
  '[ByteName] thinks you should probably drink water too.',
  '[ByteName] is running a completely experimental version of itself.',
];

const THOUGHTS = {
  general: [
    '[ByteName] is scanning nearby packets and pretending to understand all of them.',
    '[ByteName] is idling in the buffer and waiting for something interesting to compile.',
    '[ByteName] is exploring the room and tagging random objects as important.',
    '[ByteName] is watching data drift by and feeling philosophical about it.',
    '[ByteName] is running background processes and checking on you.',
  ],
  hunger: [
    '[ByteName] is low on fuel and quietly requesting a snack packet.',
    '[ByteName] is parsing food data and deciding what looks edible.',
    '[ByteName] is hungry and performance is starting to throttle.',
    '[ByteName] just finished eating and feels optimized and happy.',
    '[ByteName] is overanalyzing its last meal like it was a system update.',
  ],
  bandwidth: [
    '[ByteName] is running low on bandwidth and slowing its processes.',
    '[ByteName] is conserving energy and avoiding extra actions.',
    '[ByteName] just recharged and is running at full speed again.',
    '[ByteName] is pushing too many processes and may need a reset.',
    '[ByteName] is stable but watching energy usage closely.',
  ],
  hygiene: [
    '[ByteName] notices corruption and is trying to ignore it.',
    '[ByteName] is getting messy and data integrity is slipping.',
    '[ByteName] is actively fighting small glitches.',
    '[ByteName] just got cleaned and feels stable again.',
    '[ByteName] is slightly corrupted but calls it personality.',
  ],
  mood: [
    '[ByteName] is in a good mood and processing everything brighter.',
    '[ByteName] seems off and is struggling to stay focused.',
    '[ByteName] is calm and stable, just existing in the moment.',
    '[ByteName] is overwhelmed and buffering emotions.',
    '[ByteName] is feeling great and wants to do something fun.',
  ],
  social: [
    '[ByteName] is bored and looking for something interactive.',
    '[ByteName] is replaying old fun routines and missing the excitement.',
    '[ByteName] wants attention but refuses to say it directly.',
    '[ByteName] just had fun and is more responsive.',
    '[ByteName] is poking at things just to see what reacts.',
  ],
  training: [
    '[ByteName] is ready to train and improve its stats.',
    '[ByteName] is pushing hard and may be overdoing it.',
    '[ByteName] is exhausted but still trying to perform for you.',
    '[ByteName] just finished training and feels stronger already.',
    '[ByteName] is questioning why training feels like work now.',
  ],
  critical: [
    '[ByteName] is struggling and needs attention before things get worse.',
    '[ByteName] is entering a critical state and systems are failing.',
    '[ByteName] is barely holding together and asking for help.',
    '[ByteName] is shutting down non-essential processes to survive.',
  ],
  meta: [
    '[ByteName] noticed you were gone and logged that behavior.',
    '[ByteName] is trying to be patient while you do anything else.',
    '[ByteName] thinks you both could be more efficient right now.',
    '[ByteName] is just happy you came back.',
  ],
  system: [
    '[ByteName] is patrolling the network for suspicious activity.',
    '[ByteName] is parsing incoming data and flagging weird patterns.',
    '[ByteName] is syncing with the system and updating state.',
    '[ByteName] is testing small actions to see what changes.',
  ],
};

const TEMPERAMENT_HOOKS = {
  Kind: [
    '[ByteName] is staying gentle and steady, even when things get unstable.',
    '[ByteName] is quietly taking care of itself and others in its system.',
  ],
  Calm: [
    '[ByteName] is staying gentle and steady, even when things get unstable.',
    '[ByteName] is quietly taking care of itself and others in its system.',
  ],
  Noble: [
    '[ByteName] is staying gentle and steady, even when things get unstable.',
    '[ByteName] is quietly taking care of itself and others in its system.',
  ],
  Fierce: [
    '[ByteName] is pushing forward aggressively and wants a challenge.',
    '[ByteName] refuses to slow down even when it probably should.',
  ],
  Proud: [
    '[ByteName] is pushing forward aggressively and wants a challenge.',
    '[ByteName] refuses to slow down even when it probably should.',
  ],
  Focused: ['[ByteName] is locking in and optimizing every action it takes.'],
  Unstable: [
    '[ByteName] is jittering between processes and struggling to settle.',
    '[ByteName] is reacting faster than it can think right now.',
  ],
  Anxious: [
    '[ByteName] is jittering between processes and struggling to settle.',
    '[ByteName] is reacting faster than it can think right now.',
  ],
  Sneaky: [
    '[ByteName] is running hidden routines and not explaining any of them.',
    '[ByteName] knows something but chooses not to share it.',
  ],
  Mysterious: [
    '[ByteName] is running hidden routines and not explaining any of them.',
    '[ByteName] knows something but chooses not to share it.',
  ],
  Corrupt: [
    '[ByteName] is glitching slightly and acting outside normal parameters.',
    '[ByteName] is leaning into corruption and seems stronger for it.',
  ],
};

function pick(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function replaceName(template, name) {
  return String(template || '').replaceAll('[ByteName]', name || 'BYTE');
}

function dominantNeedKey(needs = {}) {
  const entries = [
    ['hunger', Number(needs.Hunger || 0)],
    ['bandwidth', Number(needs.Bandwidth || 0)],
    ['hygiene', Number(needs.Hygiene || 0)],
    ['social', Math.min(Number(needs.Social || 0), Number(needs.Fun || 0))],
    ['mood', Number(needs.Mood || 0)],
  ];
  entries.sort((a, b) => a[1] - b[1]);
  return entries[0][0];
}

function criticalNeeds(needs = {}) {
  return ['Hunger', 'Bandwidth', 'Hygiene', 'Social', 'Fun', 'Mood'].filter((k) => Number(needs[k] || 0) < 25).length;
}

export function generateByteThought({
  byteName,
  needs,
  temperament,
  trainingSessionsToday = 0,
  idleTicks = 0,
}) {
  const name = byteName || 'BYTE';
  const crit = criticalNeeds(needs);

  if (Math.random() < RARE_THOUGHT_CHANCE) {
    return replaceName(pick(RARE_POOL), name);
  }

  const pools = [];

  if (crit > 0) pools.push(THOUGHTS.critical);
  pools.push(THOUGHTS[dominantNeedKey(needs)] || THOUGHTS.general);

  if (trainingSessionsToday >= 5) pools.push(THOUGHTS.training);
  if (idleTicks > 2) pools.push(THOUGHTS.meta);

  const temperamentPool = TEMPERAMENT_HOOKS[String(temperament || '')];
  if (temperamentPool) pools.push(temperamentPool);

  pools.push(THOUGHTS.system, THOUGHTS.general);

  const selectedPool = pick(pools) || THOUGHTS.general;
  return replaceName(pick(selectedPool), name);
}
