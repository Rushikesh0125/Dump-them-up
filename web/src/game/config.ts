// Game constants. Economy values mirror the contract's immutable parameters (see the spec).

export type CartelId = 'dragon' | 'shitzu' | 'neko';
export type JobType = 'coin' | 'bag' | 'vault';
export type ProtectionTier = 0 | 1 | 2 | 3;
export type Motif = 'flame' | 'bone' | 'paw';

export const ECON = {
  RAIDER_RTP: 0.95,
  TRIBUTE: 0.05,
  FEE: 0.01,
  RAID_LOSS_CAP: 0.01, // a single winning hit takes at most 1% of a vault
} as const;

export interface Tier {
  id: number;
  type: JobType;
  name: string;
  m: number; // payout multiple of cost
  p: number; // base win chance
  label: string;
  color: string;
  stamp: string;
}

export const TIERS: Tier[] = [
  { id: 0, type: 'coin', name: 'The Toss', m: 1.9, p: 0.5, label: '1.9×', color: '#d4a53a', stamp: '#8a6a1c' },
  { id: 1, type: 'bag', name: 'The Shell Game', m: 3.8, p: 0.25, label: '3.8×', color: '#7bd88f', stamp: '#2f7a46' },
  { id: 2, type: 'vault', name: 'Crack the Safe', m: 9.5, p: 0.1, label: '9.5×', color: '#e0344a', stamp: '#8a1c2b' },
];

export interface ProtectionDef {
  tier: ProtectionTier;
  name: string;
  mult: number; // multiplies the hitter's win chance
  color: string;
}

export const PROTECTION: ProtectionDef[] = [
  { tier: 0, name: '', mult: 1, color: '#000000' },
  { tier: 1, name: 'COPIUM COVER · T1', mult: 0.9, color: '#6ee8b2' },
  { tier: 2, name: 'HOPIUM COVER · T2', mult: 0.8, color: '#b388ff' },
  { tier: 3, name: 'DIAMOND HANDS · T3', mult: 0.6, color: '#8fe3ff' },
];

export interface CartelDef {
  id: CartelId;
  ticker: string;
  name: string;
  neon: string;
  frame: string;
  trim: string;
  door: string;
  doorEdge: string;
  bolt: string;
  motif: Motif;
  motifFill: string;
  floatDelay: number;
  mascot: string[];
  palette: Record<string, string>;
}

const HAT = ['...HHHHHH...', '...BBBBBB...', '.HHHHHHHHHH.'];

export const CARTELS: Record<CartelId, CartelDef> = {
  dragon: {
    id: 'dragon', ticker: '$BLACKDRAGON', name: 'Black Dragon', neon: '#ff6a3d',
    frame: '#1e1416', trim: '#5a2a22', door: '#2a1a1c', doorEdge: '#a8322a', bolt: '#ff6a3d',
    motif: 'flame', motifFill: '#ff6a3d', floatDelay: 0,
    mascot: [...HAT, '..K......K..', '..KX....XK..', '...XXXXXX...', '..XXXXXXXX..', '.XXYKXXYKXX.', '.XXXXXXXXXX.', '..XOOOOOOX..', '..XOWOOWOX..', '...XOOOOX...', '....XXXX....', '.....XX.....', '............', '............'],
    palette: { H: '#2b2420', B: '#c9a24a', X: '#a8322a', K: '#1a0e10', Y: '#ffd54a', O: '#ff7a3d', W: '#fff3e0' },
  },
  shitzu: {
    id: 'shitzu', ticker: '$SHITZU', name: 'Shitzu', neon: '#d4a53a',
    frame: '#241d12', trim: '#6b5216', door: '#3a2e18', doorEdge: '#d4a53a', bolt: '#f0cf7a',
    motif: 'bone', motifFill: '#efe6d2', floatDelay: -1.2,
    mascot: [...HAT, 'XXXX....XXXX', 'XXXXXXXXXXXX', '.XXXXXXXXXX.', '.XKXXXXXXKX.', '.XXXXXXXXXX.', '.XXXWWWWXXX.', '..XWWKKWWX..', '..XWWWWWWX..', '...XWOOWX...', '....XXXX....', '............', '............', '............'],
    palette: { H: '#2b2420', B: '#e0344a', X: '#e0a43a', K: '#2a1a10', Y: '#ffd54a', O: '#ff6f8a', W: '#fff1d0' },
  },
  neko: {
    id: 'neko', ticker: '$NEKO', name: 'NEKO', neon: '#ff5fae',
    frame: '#241420', trim: '#6a2a58', door: '#3a1e34', doorEdge: '#ff5fae', bolt: '#ffb0dc',
    motif: 'paw', motifFill: '#ffd0e6', floatDelay: -2.3,
    mascot: [...HAT, 'XX........XX', 'XXX......XXX', 'XXXXXXXXXXXX', 'XKKXXXXXXKKX', 'XKKXXXXXXKKX', 'XXXXXOOXXXXX', 'XXXXWWWWXXXX', '.XXXXXXXXXX.', '..XXXXXXXX..', '............', '............', '............', '............'],
    palette: { H: '#2b2420', B: '#efe6d2', X: '#ff5fae', K: '#2a0f22', Y: '#ffd54a', O: '#ffd0e6', W: '#ffffff' },
  },
};

export const CARTEL_ORDER: CartelId[] = ['dragon', 'shitzu', 'neko'];

export const RANKS = ['ASSOCIATE', 'ASSOCIATE', 'ASSOCIATE', 'SOLDIER', 'SOLDIER', 'SOLDIER', 'CAPO', 'CAPO', 'CAPO', 'UNDERBOSS', 'UNDERBOSS', 'DON'];
export const RESPECT_PER_LEVEL = 400;

export const rankFor = (level: number) => RANKS[Math.min(RANKS.length - 1, level)];
