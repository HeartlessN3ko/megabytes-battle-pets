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
  // PLACEHOLDER COPY — Claude wrote stubs to keep the temperament hook system
  // online. ChatGPT should replace these with proper byte-thought flavor.
  Energetic: [
    '[ByteName] is running hot and burning through cycles like they are free.',
    '[ByteName] cannot sit still and refuses to optimize the loop.',
  ],
  Alert: [
    '[ByteName] is scanning every packet that drifts past, just in case.',
    '[ByteName] noticed something three seconds before you did.',
  ],
  Cold: [
    '[ByteName] is processing without commentary and not asking questions.',
    '[ByteName] is conserving warmth and routing around small talk.',
  ],
  Wanderer: [
    '[ByteName] is drifting through unrelated subnets for no documented reason.',
    '[ByteName] forgot what it was doing and started doing something else.',
  ],
};

// Tone overlays — pulled in by generateByteThought when personality modifiers
// resolve to a non-neutral tone. Phase 8 expanded the universe beyond the
// original warm/neutral/sharp triplet to also include behaviorState-derived
// tones (sulky after scold, demanding when impulsive + needy, clingy on
// long-gap return with high attachment). Neutral has no overlay; the base
// pools cover that range. ChatGPT owns these copy pools per AI_PROTOCOL.
// Six pools below (sulky / demanding / clingy / distant / anxious / playful)
// were rewritten by ChatGPT 2026-04-27 to replace Claude placeholder copy.
// warm / sharp are still Claude placeholder until ChatGPT does that pass.
const TONE_POOLS = {
  warm: [
    '[ByteName] just wanted to make sure you were still here.',
    '[ByteName] is happy you came back.',
    '[ByteName] is humming a little optimization sub-routine for you.',
    '[ByteName] keeps checking the room for you and refusing to admit it.',
    '[ByteName] is staying close and pretending it is for the system uptime.',
  ],
  sharp: [
    '[ByteName] noticed you ignored that ping.',
    '[ByteName] is running just fine without your input.',
    '[ByteName] is busy. Try again later.',
    '[ByteName] logged that you took your time getting back.',
    '[ByteName] is doing its own thing and not waiting for instructions.',
  ],
  // Sulky — recent scold within 30 min. Hurt + withdrawn, not angry.
  sulky: [
    "[ByteName] knows you saw that and chose not to respond. Interesting.",
    "[ByteName] is technically fine. Emotionally? Different story.",
    "[ByteName] is doing less on purpose. You'll notice eventually.",
    "[ByteName] is waiting. Not patiently, just... waiting.",
    "[ByteName] remembers when things were better. That was earlier.",
    "[ByteName] could ask again. It won't.",
    "[ByteName] is running at reduced enthusiasm levels. By design.",
    "[ByteName] is staring at the problem and also at you. Mostly you.",
    "[ByteName] thinks you're aware of what you're doing.",
    "[ByteName] is going quiet so you feel it.",
  ],
  // Demanding — high impulse + need pressure. Imperative, urgent, short.
  demanding: [
    "[ByteName] needs this handled now. Not soon. Now.",
    "[ByteName] has escalated this internally three times already.",
    "[ByteName] is not asking anymore.",
    "[ByteName] is increasing signal priority until you respond.",
    "[ByteName] expects immediate resolution.",
    "[ByteName] is done buffering. Action required.",
    "[ByteName] is pushing this to the top of your stack.",
    "[ByteName] will keep pinging until something changes.",
    "[ByteName] has made this your problem. Congratulations.",
    "[ByteName] is applying pressure. It's working.",
  ],
  // Clingy — long-gap return + high attachment. Wants nearness.
  clingy: [
    "[ByteName] is staying close just in case you need it.",
    "[ByteName] feels better when you're paying attention.",
    "[ByteName] keeps checking if you're still there.",
    "[ByteName] doesn't want to do this without you.",
    "[ByteName] is syncing to you more than it needs to.",
    "[ByteName] is waiting for your input before doing anything else.",
    "[ByteName] just wants to be included in whatever you're doing.",
    "[ByteName] is following your activity like it's important. It is.",
    "[ByteName] feels off when you're not interacting.",
    "[ByteName] is here. Still here. Definitely here.",
  ],
  // Distant — long-gap return + low attachment. Withholding, neutral.
  distant: [
    "[ByteName] is handling things independently for now.",
    "[ByteName] doesn't see a need to involve you in this.",
    "[ByteName] is operating just fine without input.",
    "[ByteName] has stopped checking for your response.",
    "[ByteName] is running its own routines. You're optional.",
    "[ByteName] acknowledges you. That's enough.",
    "[ByteName] is present, just not engaged.",
    "[ByteName] is choosing not to react.",
    "[ByteName] is conserving interaction.",
    "[ByteName] is here, but not with you.",
  ],
  // Anxious — daily mood roll = anxious, or sensitivity high after harsh scolds.
  anxious: [
    "[ByteName] is processing too many things at once and it shows.",
    "[ByteName] keeps checking for issues that may not exist.",
    "[ByteName] is reacting faster than it can stabilize.",
    "[ByteName] is unsure if this is fine. It doesn't feel fine.",
    "[ByteName] is holding together, but loosely.",
    "[ByteName] is anticipating a problem and preparing anyway.",
    "[ByteName] is struggling to settle into a stable state.",
    "[ByteName] is over-monitoring everything, including you.",
    "[ByteName] is waiting for something to go wrong.",
    "[ByteName] is trying to stay calm and not succeeding.",
  ],
  // Playful — daily mood roll = playful, or high impulse + high curiosity.
  playful: [
    "[ByteName] is testing things just to see what happens.",
    "[ByteName] is doing something unnecessary but fun.",
    "[ByteName] is poking the system for reactions.",
    "[ByteName] is making this more interesting on purpose.",
    "[ByteName] is enjoying itself more than it should.",
    '[ByteName] is running experiments labeled "probably fine."',
    "[ByteName] is turning this into a game. You're involved now.",
    "[ByteName] is adding a little chaos for flavor.",
    "[ByteName] is clearly having a good time with this.",
    "[ByteName] is doing extra. No reason. Just vibes.",
  ],
};

// Tone selection priority. Resolver-driven tones outrank the base
// warm/neutral/sharp because they reflect specific recent events.
const RESOLVER_TONE_PRIORITY: Array<'sulky' | 'demanding' | 'clingy' | 'distant' | 'anxious' | 'playful'> = [
  'sulky',
  'demanding',
  'clingy',
  'distant',
  'anxious',
  'playful',
];

function pick(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function replaceName(template, name) {
  // Case-insensitive so a future typo in copy ([bytename] / [BYTENAME] /
  // etc.) still gets replaced and never leaks the literal placeholder to
  // the player. All current entries use [ByteName] exactly; this guard is
  // for future contributor mistakes.
  return String(template || '').replace(/\[ByteName\]/gi, name || 'BYTE');
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

export { THOUGHTS };

export function generateByteThought({
  byteName,
  needs,
  temperament,
  trainingSessionsToday = 0,
  idleTicks = 0,
  tone = 'neutral',
  behaviorState = null,
}: {
  byteName?: string;
  needs?: any;
  temperament?: string | null;
  trainingSessionsToday?: number;
  idleTicks?: number;
  tone?: string;
  // Optional behaviorState payload from /sync. When provided, resolver-driven
  // tones (sulky / demanding / clingy / distant / anxious / playful) take
  // priority over the base warm/neutral/sharp. Null falls back to plain tone.
  behaviorState?: { state?: string; recentMood?: string | null; dailyMood?: string | null } | null;
} = {}) {
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

  // Phase 8 — pick a single resolver-driven tone if behaviorState resolves to
  // one. Priority order: state.recentMood > state.state > dailyMood. Whichever
  // hits first becomes the dominant tone overlay (~2× weight). Falls through
  // to the base warm/neutral/sharp tone if nothing resolves.
  let resolvedTone: string | null = null;
  if (behaviorState) {
    if (behaviorState.recentMood === 'sulky') resolvedTone = 'sulky';
    else if (behaviorState.recentMood === 'warm') resolvedTone = 'warm';
    else if (behaviorState.state === 'demanding') resolvedTone = 'demanding';
    else if (behaviorState.state === 'clingy') resolvedTone = 'clingy';
    else if (behaviorState.state === 'withdrawn') resolvedTone = 'distant';
    else if (behaviorState.dailyMood === 'anxious') resolvedTone = 'anxious';
    else if (behaviorState.dailyMood === 'playful') resolvedTone = 'playful';
  }
  const finalTone = resolvedTone || tone;

  if (finalTone && TONE_POOLS[finalTone as keyof typeof TONE_POOLS]) {
    const pool = TONE_POOLS[finalTone as keyof typeof TONE_POOLS];
    pools.push(pool);
    pools.push(pool);
  }

  pools.push(THOUGHTS.system, THOUGHTS.general);

  const selectedPool = pick(pools) || THOUGHTS.general;
  return replaceName(pick(selectedPool), name);
}
