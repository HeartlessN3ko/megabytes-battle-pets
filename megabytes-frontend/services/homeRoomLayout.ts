export type RoomLayerId =
  | 'backWall'
  | 'leftWall'
  | 'rightWall'
  | 'floor'
  | 'glow'
  | 'particles'
  | 'foregroundLeft'
  | 'foregroundRight';

export type RoomLayerMotion = {
  id: RoomLayerId;
  maxX: number;
  maxY: number;
  depth: 'far' | 'mid-far' | 'mid' | 'near' | 'overlay';
};

export type DecorSlotType =
  | 'wall_art'
  | 'feature'
  | 'cabinet'
  | 'shelf'
  | 'device_surface'
  | 'floor_large'
  | 'floor_small';

export type DecorSlotDef = {
  id: string;
  type: DecorSlotType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  label: string;
};

// Normalized slot coordinates are based on a 0..100 stage space.
export const HOME_ROOM_DECOR_SLOTS: DecorSlotDef[] = [
  { id: 'wall_left_frame', type: 'wall_art', x: 17, y: 21, width: 19, height: 14, zIndex: 2, label: 'LEFT WALL FRAME' },
  { id: 'wall_right_frame', type: 'wall_art', x: 64, y: 21, width: 19, height: 14, zIndex: 2, label: 'RIGHT WALL FRAME' },
  { id: 'wall_center_feature', type: 'feature', x: 39, y: 12, width: 22, height: 12, zIndex: 2, label: 'CENTER WALL FEATURE' },
  { id: 'cabinet_left', type: 'cabinet', x: 7, y: 58, width: 17, height: 19, zIndex: 5, label: 'LEFT CABINET' },
  { id: 'cabinet_right', type: 'cabinet', x: 76, y: 58, width: 17, height: 19, zIndex: 5, label: 'RIGHT CABINET' },
  { id: 'surface_left_device', type: 'device_surface', x: 12, y: 53, width: 13, height: 7, zIndex: 6, label: 'LEFT DEVICE SURFACE' },
  { id: 'surface_right_device', type: 'device_surface', x: 75, y: 53, width: 13, height: 7, zIndex: 6, label: 'RIGHT DEVICE SURFACE' },
  { id: 'floor_left_large', type: 'floor_large', x: 10, y: 72, width: 18, height: 12, zIndex: 6, label: 'LEFT FLOOR LARGE' },
  { id: 'floor_right_large', type: 'floor_large', x: 72, y: 72, width: 18, height: 12, zIndex: 6, label: 'RIGHT FLOOR LARGE' },
  { id: 'floor_left_small', type: 'floor_small', x: 28, y: 63, width: 10, height: 8, zIndex: 4, label: 'LEFT FLOOR SMALL' },
  { id: 'floor_right_small', type: 'floor_small', x: 62, y: 63, width: 10, height: 8, zIndex: 4, label: 'RIGHT FLOOR SMALL' },
];

export const HOME_ROOM_LAYER_MOTION: RoomLayerMotion[] = [
  { id: 'backWall', maxX: 4, maxY: 2, depth: 'far' },
  { id: 'leftWall', maxX: 6, maxY: 3, depth: 'far' },
  { id: 'rightWall', maxX: 6, maxY: 3, depth: 'far' },
  { id: 'floor', maxX: 10, maxY: 6, depth: 'mid' },
  { id: 'glow', maxX: 5, maxY: 3, depth: 'mid-far' },
  { id: 'particles', maxX: 12, maxY: 8, depth: 'overlay' },
  { id: 'foregroundLeft', maxX: 16, maxY: 10, depth: 'near' },
  { id: 'foregroundRight', maxX: 16, maxY: 10, depth: 'near' },
];
