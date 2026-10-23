// The real Deps for lib/payouts.ts: reads and sends on the Stellar public network from the payout
// account (its secret comes from the caller's environment and is never printed).
import { Asset, BASE_FEE, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import type { makeDb } from "./db.ts";
import { Rejected, type Deps } from "./payouts.ts";
import { findSentWithMemo, hasTrustline, HORIZON, tokenBalance, totalHolding } from "./stellar.ts";
import { MAIN_TOKEN } from "./tokens.ts";

export function stellarDeps(db: ReturnType<typeof makeDb>, secret: string): Deps & { account: string; balance: () => Promise<number> } {
  const kp = Keypair.fromSecret(secret);
  const server = new Horizon.Server(HORIZON);
  const asset = new Asset(MAIN_TOKEN.code, MAIN_TOKEN.issuer!);
  return {
    db,
    account: kp.publicKey(),
    now: () => Date.now(),
    balance: () => tokenBalance(kp.publicKey()),
    sentWithMemo: (memo) => findSentWithMemo(kp.publicKey(), memo),
    trustline: (address) => hasTrustline(address),
    holding: (addresses) => totalHolding(addresses),
    async send(destination, amount, memo) {
      const account = await server.loadAccount(kp.publicKey());
      const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
        .addOperation(Operation.payment({ destination, asset, amount: String(amount) }))
        .addMemo(Memo.text(memo))
        .setTimeout(120)
        .build();
      tx.sign(kp);
      try {
        return (await server.submitTransaction(tx)).hash;
      } catch (e) {
        const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } }).response?.data?.extras?.result_codes;
        if (codes) throw new Rejected(JSON.stringify(codes));
        throw e;
      }
    },
  };
}
