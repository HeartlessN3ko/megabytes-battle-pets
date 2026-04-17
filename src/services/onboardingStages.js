// Onboarding stage text and progression flow

const STAGES = {
  entry: {
    title: 'Entry',
    text: 'Connection established.\n\nData residents are requesting assistance.\n\nInitializing user setup...'
  },
  setup: {
    title: 'User Setup',
    text: 'Program user settings.'
  },
  role: {
    title: 'Role',
    text: 'User device is now an active node in the network.\n\nUser will raise a MEGA-BYTE.\nUser will maintain its stability.\nUser will train it to defend against corrupted content.'
  },
  calibration: {
    title: 'Calibration',
    text: 'Calibrating user profile.\n\nThese settings will influence how your MEGA-BYTE develops.'
  },
  profile: {
    title: 'Profile',
    text: 'User profile generated.\n\nAssign visual identifier.'
  },
  transition: {
    title: 'Transition',
    text: 'Initializing data seed selection...\n\nAvailable MEGA-BYTE seeds detected.'
  },
  egg_intro: {
    title: 'Egg Selection',
    text: 'These are uninitialized MEGA-BYTE seeds.\n\nEach form represents a base structure.\n\nStructure influences potential, but does not define outcome.'
  },
  egg_shapes: {
    title: 'Available Shapes',
    shapes: {
      circle: {
        name: 'Circle',
        description: 'Balanced and adaptive.\nStable growth across all systems.\nResponds well to consistent interaction.'
      },
      square: {
        name: 'Square',
        description: 'Defensive and grounded.\nHigher durability.\nMaintains stability under strain.'
      },
      triangle: {
        name: 'Triangle',
        description: 'Aggressive and fast.\nHigher output potential.\nLower tolerance for instability.'
      },
      diamond: {
        name: 'Diamond',
        description: 'Precise and focused.\nHigher accuracy.\nOptimized for controlled execution.'
      },
      hexagon: {
        name: 'Hexagon',
        description: 'Stable and efficient.\nReliable performance.\nHandles mixed conditions well.'
      }
    }
  },
  egg_select: {
    title: 'Select Shape',
    text: 'Select a base structure to initialize.'
  },
  egg_confirm: {
    title: 'Confirm',
    text: 'Binding structure to user profile...\n\nInitializing MEGA-BYTE...'
  },
  tutorial_system: {
    title: 'System Alert',
    text: 'Connection stable.\n\nWarning: network instability detected.\n\nPacket City is experiencing rapid data degradation.\n\nSource identified: Slopitron.exe'
  },
  tutorial_mayor: {
    title: 'Mayor Orion Kernel',
    speaker: 'Mayor Orion Kernel',
    text: '...Signal connected.\n\nHey — yeah, I see you. Good.\n\nThanks for installing the app. We needed more users online.'
  },
  tutorial_threat: {
    title: 'The Threat',
    speaker: 'Mayor Orion Kernel',
    text: 'Things are getting bad here.\n\nSlopitron.exe is pushing out unstable data faster than we can contain it.\n\nIt\'s flooding the network.\nIf it keeps up, Packet City won\'t hold.'
  },
  tutorial_ack: {
    title: 'Your Setup',
    speaker: 'Mayor Orion Kernel',
    text: 'Let me check your setup...\n\nAlright — you picked: [User Megabyte].\n\nNice. That\'s a solid one to work with.'
  },
  tutorial_role: {
    title: 'Your Role',
    speaker: 'Mayor Orion Kernel',
    text: 'Your phone now acts as a node connected to our network.\n\nYour MEGA-BYTE lives inside it.\n\nYou can run programs to take care of it, train it, and keep it stable.\n\nDo that right, and it helps us fight back the corruption.'
  },
  tutorial_home: {
    title: 'Home Screen',
    speaker: 'Mayor Orion Kernel',
    text: 'This is your home screen.\n\nYou\'ll see your MEGA-BYTE here, and everything it needs to stay stable.'
  },
  tutorial_stats: {
    title: 'Understanding Stats',
    speaker: 'Mayor Orion Kernel',
    text: 'Stats show how strong it is.\n\nNeeds show how stable it is.\n\nIgnore those, and performance drops.\nPush it too far, and it can destabilize.'
  },
  tutorial_care: {
    title: 'Care Matters',
    speaker: 'Mayor Orion Kernel',
    text: 'So make sure you\'re taking care of it.\n\nIf it falls apart, it can\'t help anyone.'
  },
  tutorial_corruption: {
    title: 'Corruption',
    speaker: 'Mayor Orion Kernel',
    text: 'Uh oh. See that buildup?\n\nThat\'s corruption.\n\nSlopitron\'s data gets stuck in your MEGA-BYTE over time.'
  },
  tutorial_install: {
    title: 'Install Room',
    speaker: 'Mayor Orion Kernel',
    text: 'Here — install this Cleansing Room.\n\nInstalling: Cleansing Room...\n\nGood. Now you can actually deal with it.'
  },
  tutorial_action: {
    title: 'Take Action',
    speaker: 'Mayor Orion Kernel',
    text: 'Run the cleanse.'
  },
  tutorial_result: {
    title: 'Success',
    speaker: 'Mayor Orion Kernel',
    text: 'There you go.\n\nClean data. Stable state.'
  },
  tutorial_training: {
    title: 'Training',
    speaker: 'Mayor Orion Kernel',
    text: 'Keep it stable. Keep it active.\n\nTrain it — that\'s how it gets stronger.\n\nJust don\'t overdo it.\nToo much strain will mess it up.'
  },
  tutorial_final: {
    title: 'Final Words',
    speaker: 'Mayor Orion Kernel',
    text: 'Everything it becomes depends on how you handle it.\n\nSo pay attention.'
  },
  tutorial_exit: {
    title: 'Goodbye',
    speaker: 'Mayor Orion Kernel',
    text: 'That\'s it.\n\nYou\'re live now.\n\nDon\'t let the network fall apart on your watch.\n\nWe\'re counting on you.'
  }
};

// Progression order
const STAGE_ORDER = [
  'entry',
  'setup',
  'role',
  'calibration',
  'profile',
  'transition',
  'egg_intro',
  'egg_shapes',
  'egg_select',
  'egg_confirm',
  'tutorial_system',
  'tutorial_mayor',
  'tutorial_threat',
  'tutorial_ack',
  'tutorial_role',
  'tutorial_home',
  'tutorial_stats',
  'tutorial_care',
  'tutorial_corruption',
  'tutorial_install',
  'tutorial_action',
  'tutorial_result',
  'tutorial_training',
  'tutorial_final',
  'tutorial_exit'
];

function getStageData(stageName) {
  return STAGES[stageName] || null;
}

function getNextStage(currentStageName) {
  const currentIndex = STAGE_ORDER.indexOf(currentStageName);
  if (currentIndex === -1 || currentIndex === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[currentIndex + 1];
}

function isLastStage(stageName) {
  return stageName === STAGE_ORDER[STAGE_ORDER.length - 1];
}

module.exports = {
  STAGES,
  STAGE_ORDER,
  getStageData,
  getNextStage,
  isLastStage
};
