/**
 * Generate a fresh devnet treasury keypair.
 *
 *   npm run treasury:new
 *
 * Prints the public address and the base58 secret key to paste into
 * backend/.env as TREASURY_SECRET_KEY. Nothing is written to disk — a secret
 * key on disk is a secret key that gets committed by accident.
 */
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
const kp = Keypair.generate();
console.log('\n  New treasury keypair (devnet)\n');
console.log(`  Public address : ${kp.publicKey.toBase58()}`);
console.log(`  Secret (base58): ${bs58.encode(kp.secretKey)}\n`);
console.log('  Paste into backend/.env:');
console.log(`  TREASURY_SECRET_KEY=${bs58.encode(kp.secretKey)}\n`);
console.log('  Fund it on devnet with:');
console.log(`  solana airdrop 2 ${kp.publicKey.toBase58()} --url devnet\n`);
console.log('  Never reuse this key on mainnet, and never commit it.\n');
//# sourceMappingURL=newTreasury.js.map