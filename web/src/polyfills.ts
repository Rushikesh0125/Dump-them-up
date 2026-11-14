// wallet-selector and near-api-js expect Node's Buffer/global/process in the browser.
import { Buffer } from 'buffer';

const g = globalThis as unknown as { Buffer?: typeof Buffer; global?: unknown; process?: { env: Record<string, string> } };
g.Buffer = g.Buffer ?? Buffer;
g.global = g.global ?? globalThis;
g.process = g.process ?? { env: {} };
