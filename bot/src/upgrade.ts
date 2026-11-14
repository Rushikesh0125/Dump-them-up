// Deploys new contract code to the live game account WITHOUT re-initialising it (state is kept).
// Only safe when the stored structs are unchanged (e.g. a view-only change).
// Usage: MASTER_ACCOUNT=dtu-59c7f8.testnet npx tsx src/upgrade.ts ../contract/target/wasm32-unknown-unknown/release/dump_them_up.wasm
import { readFileSync } from 'node:fs';
import { utils } from 'near-api-js';
import { ids, nearConnection } from './near';

const wasm = readFileSync(process.argv[2]);
const near = await nearConnection();
const game = await near.account(ids().game);
const before = await game.state();
console.log(`${game.accountId}: ${utils.format.formatNearAmount(before.amount.toString(), 3)} NEAR, code ${before.code_hash}, storage ${before.storage_usage} B`);
if (process.argv.includes('--dry')) process.exit(0);
await game.deployContract(wasm);
const after = await game.state();
console.log(`deployed ${wasm.length} B -> code ${after.code_hash}, ${utils.format.formatNearAmount(after.amount.toString(), 3)} NEAR left, storage ${after.storage_usage} B`);
