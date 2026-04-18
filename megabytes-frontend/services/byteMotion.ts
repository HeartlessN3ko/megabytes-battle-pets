export type MotionProfile = {
  key: 'static' | 'waddle' | 'glide';
  home: {
    hoverDistance: number;
    hoverDuration: number;
    breatheScale: number;
    breatheDuration: number;
    strideValues: number[];
    strideDurations: number[];
    roamSpreadX: number;
    depthMin: number;
    depthMax: number;
    depthYOffset: number;
    yJitter: number;
    roamDurationMin: number;
    roamDurationMax: number;
    pauseMin: number;
    pauseMax: number;
    facingThreshold: number;
  };
  room: {
    bobDistance: number;
    bobDuration: number;
    breatheScale: number;
    breatheDuration: number;
    roamSpreadX: number;
    roamSpreadY: number;
    roamDurationMin: number;
    roamDurationMax: number;
    pauseMin: number;
    pauseMax: number;
  };
};

const MOTION_PROFILES: MotionProfile[] = [
  {
    key: 'static',
    home: {
      hoverDistance: 2,
      hoverDuration: 2200,
      breatheScale: 1.015,
      breatheDuration: 2400,
      strideValues: [0.04, -0.04, 0],
      strideDurations: [360, 360, 280],
      roamSpreadX: 0.08,
      depthMin: 0.98,
      depthMax: 1.02,
      depthYOffset: 20,
      yJitter: 4,
      roamDurationMin: 2400,
      roamDurationMax: 3200,
      pauseMin: 1200,
      pauseMax: 2200,
      facingThreshold: 999,
    },
    room: {
      bobDistance: 2,
      bobDuration: 2200,
      breatheScale: 1.012,
      breatheDuration: 2400,
      roamSpreadX: 0.06,
      roamSpreadY: 6,
      roamDurationMin: 2400,
      roamDurationMax: 3200,
      pauseMin: 1200,
      pauseMax: 2200,
    },
  },
  {
    key: 'waddle',
    home: {
      hoverDistance: 0,
      hoverDuration: 2800,
      breatheScale: 1,
      breatheDuration: 2400,
      strideValues: [0.35, -0.35, 0.15, -0.15, 0],
      strideDurations: [520, 520, 400, 400, 320],
      roamSpreadX: 0.55,
      depthMin: 1.0,
      depthMax: 1.0,
      depthYOffset: 0,
      yJitter: 0,
      roamDurationMin: 2000,
      roamDurationMax: 3800,
      pauseMin: 800,
      pauseMax: 2400,
      facingThreshold: 18,
    },
    room: {
      bobDistance: 6,
      bobDuration: 1600,
      breatheScale: 1.04,
      breatheDuration: 1700,
      roamSpreadX: 0.36,
      roamSpreadY: 26,
      roamDurationMin: 1700,
      roamDurationMax: 3000,
      pauseMin: 500,
      pauseMax: 1400,
    },
  },
  {
    key: 'glide',
    home: {
      hoverDistance: 10,
      hoverDuration: 2100,
      breatheScale: 1.03,
      breatheDuration: 2000,
      strideValues: [0.32, -0.32, 0.14, -0.14, 0],
      strideDurations: [340, 340, 260, 260, 220],
      roamSpreadX: 0.72,
      depthMin: 0.92,
      depthMax: 1.16,
      depthYOffset: 120,
      yJitter: 12,
      roamDurationMin: 2200,
      roamDurationMax: 3600,
      pauseMin: 500,
      pauseMax: 1500,
      facingThreshold: 16,
    },
    room: {
      bobDistance: 8,
      bobDuration: 2100,
      breatheScale: 1.03,
      breatheDuration: 2000,
      roamSpreadX: 0.44,
      roamSpreadY: 18,
      roamDurationMin: 2200,
      roamDurationMax: 3500,
      pauseMin: 450,
      pauseMax: 1300,
    },
  },
];

export function getByteMotionProfile(stage: number) {
  if (stage <= 0) return MOTION_PROFILES[0];
  if (stage >= 2) return MOTION_PROFILES[2];
  return MOTION_PROFILES[1];
}

