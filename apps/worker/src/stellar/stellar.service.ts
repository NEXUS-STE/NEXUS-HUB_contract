// apps/worker/src/stellar/stellar.service.ts
//
// Direct Soroban contract integration for the NexusEscrow contract.
// Replaces the Trustless Work REST API calls with on-chain invocations.
//
// Auth model: custodial — the platform manages Stellar keypairs for users.
// The admin keypair sources all transactions. For entrypoints that require
// client/freelancer auth, the user's decrypted keypair signs the auth entry.
//
// Env vars required:
//   STELLAR_ADMIN_SECRET         — platform admin keypair secret
//   STELLAR_CONTRACT_ID          — deployed NexusEscrow contract address
//   STELLAR_TOKEN_CONTRACT_ID    — USDC SAC contract address
//   STELLAR_RPC_URL              — Soroban RPC endpoint
//   STELLAR_NETWORK_PASSPHRASE   — network passphrase
//   STELLAR_ENCRYPTION_KEY       — 32-byte hex key for AES-256-GCM user secret encryption

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  Contract,
  xdr,
  Address,
  BASE_FEE,
  scValToNative,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { authorizeEntry } from '@stellar/stellar-sdk/contract';
import * as crypto from 'crypto';

interface InvokeOptions {
  /** Additional keypairs whose auth entries must be signed (besides the admin). */
  signers?: Keypair[];
  /** How many ledgers until transaction expiry (default 30). */
  timeoutLedgers?: number;
}

@Injectable()
export class StellarService implements OnModuleInit {
  private readonly logger = new Logger(StellarService.name);

  private server!: SorobanRpc.Server;
  private adminKeypair!: Keypair;
  private contractId!: string;
  private tokenContractId!: string;
  private networkPassphrase!: string;
  private encryptionKey!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const adminSecret = this.config.getOrThrow<string>('STELLAR_ADMIN_SECRET');
    this.adminKeypair = Keypair.fromSecret(adminSecret);
    this.contractId = this.config.getOrThrow<string>('STELLAR_CONTRACT_ID');
    this.tokenContractId = this.config.getOrThrow<string>('STELLAR_TOKEN_CONTRACT_ID');
    this.networkPassphrase = this.config.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
      'Test SDF Network ; September 2015',
    );
    this.server = new SorobanRpc.Server(
      this.config.get<string>('STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org'),
      { allowHttp: false },
    );
    const hexKey = this.config.getOrThrow<string>('STELLAR_ENCRYPTION_KEY');
    this.encryptionKey = Buffer.from(hexKey, 'hex');

    this.logger.log(`Stellar connected — contract ${this.contractId}`);
  }

  // ─── Custodial key helpers ────────────────────────────────────────────────

  /** Encrypt a Stellar secret for storage in the DB. */
  encryptSecret(secret: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  /** Decrypt a stored Stellar secret. */
  decryptSecret(ciphertext: string): string {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  keypairFromEncrypted(ciphertext: string): Keypair {
    return Keypair.fromSecret(this.decryptSecret(ciphertext));
  }

  // ─── Contract entrypoints ────────────────────────────────────────────────

  /**
   * `init_escrow` — creates the on-chain escrow record.
   * Requires client.require_auth().
   */
  async initEscrow(params: {
    escrowId: string;
    clientSecret: string;
    freelancerAddress: string;
    amount: bigint;
    milestoneHash: string;
    description: string;
    disputeDelay: number;
    milestonesTotal: number;
    expiryLedger: number;
  }): Promise<string> {
    const clientKeypair = Keypair.fromSecret(params.clientSecret);
    const escrowIdBytes = Buffer.from(params.escrowId.replace(/-/g, ''), 'hex');

    const args: xdr.ScVal[] = [
      nativeToScVal(escrowIdBytes, { type: 'bytes' }),
      new Address(clientKeypair.publicKey()).toScVal(),
      new Address(params.freelancerAddress).toScVal(),
      new Address(this.tokenContractId).toScVal(),
      nativeToScVal(params.amount, { type: 'i128' }),
      nativeToScVal(Buffer.from(params.milestoneHash, 'hex'), { type: 'bytes' }),
      nativeToScVal(params.description, { type: 'string' }),
      nativeToScVal(params.disputeDelay, { type: 'u32' }),
      nativeToScVal(params.milestodesTotal ?? 0, { type: 'u32' }),
      nativeToScVal(params.expiryLedger, { type: 'u32' }),
    ];

    return this.invoke('init_escrow', args, { signers: [clientKeypair] });
  }

  /**
   * `fund` — client deposits tokens into the contract.
   * Requires client.require_auth() and a prior token approval.
   */
  async fundEscrow(escrowId: string, clientSecret: string): Promise<string> {
    const clientKeypair = Keypair.fromSecret(clientSecret);
    const escrowIdBytes = this.escrowIdToBytes(escrowId);

    // First approve the contract to spend the token on behalf of the client.
    // The contract's `fund` entrypoint calls token.transfer internally after auth.
    return this.invoke('fund', [nativeToScVal(escrowIdBytes, { type: 'bytes' })], {
      signers: [clientKeypair],
    });
  }

  /**
   * `release` — client releases funds to the freelancer.
   * Requires client.require_auth().
   */
  async releaseEscrow(escrowId: string, clientSecret: string, milestoneHash: string): Promise<string> {
    const clientKeypair = Keypair.fromSecret(clientSecret);
    return this.invoke(
      'release',
      [
        nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' }),
        new Address(clientKeypair.publicKey()).toScVal(),
        nativeToScVal(Buffer.from(milestoneHash, 'hex'), { type: 'bytes' }),
      ],
      { signers: [clientKeypair] },
    );
  }

  /**
   * `refund` — admin returns funds to the client.
   * Requires admin.require_auth().
   */
  async refundEscrow(escrowId: string): Promise<string> {
    return this.invoke('refund', [nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' })]);
  }

  /**
   * `approve_release` — client or freelancer approves a 2-of-2 release.
   * Requires approver.require_auth().
   */
  async approveRelease(escrowId: string, approverSecret: string): Promise<string> {
    const approverKeypair = Keypair.fromSecret(approverSecret);
    return this.invoke(
      'approve_release',
      [
        nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' }),
        new Address(approverKeypair.publicKey()).toScVal(),
      ],
      { signers: [approverKeypair] },
    );
  }

  /**
   * `complete_milestone` — freelancer marks a milestone done.
   * Requires freelancer.require_auth().
   */
  async completeMilestone(escrowId: string, freelancerSecret: string): Promise<string> {
    const freelancerKeypair = Keypair.fromSecret(freelancerSecret);
    return this.invoke(
      'complete_milestone',
      [nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' })],
      { signers: [freelancerKeypair] },
    );
  }

  /**
   * `claim_expired` — permissionless expiry claim, admin keypair sources the tx.
   */
  async claimExpired(escrowId: string): Promise<string> {
    return this.invoke('claim_expired', [
      nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' }),
    ]);
  }

  /**
   * Read the on-chain escrow record. Returns the raw ScVal result.
   */
  async getEscrowRecord(escrowId: string): Promise<Record<string, unknown>> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'get_escrow',
      nativeToScVal(this.escrowIdToBytes(escrowId), { type: 'bytes' }),
    );

    const sourceAccount = await this.server.getAccount(this.adminKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    const result = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`get_escrow simulation failed: ${result.error}`);
    }
    if (!result.result) throw new Error('No result from get_escrow');

    return scValToNative(result.result.retval) as Record<string, unknown>;
  }

  // ─── Core invocation helper ───────────────────────────────────────────────

  private async invoke(
    method: string,
    args: xdr.ScVal[],
    options: InvokeOptions = {},
  ): Promise<string> {
    const { signers = [], timeoutLedgers = 30 } = options;

    const contract = new Contract(this.contractId);
    const operation = contract.call(method, ...args);

    const sourceAccount = await this.server.getAccount(this.adminKeypair.publicKey());
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(timeoutLedgers)
      .build();

    // Simulate to get resource fees and auth entries.
    const simResult = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed for ${method}: ${simResult.error}`);
    }

    // Sign any auth entries that belong to non-admin keypairs.
    const latestLedger = simResult.latestLedger;
    const validUntil = latestLedger + timeoutLedgers;

    const rawAuth: xdr.SorobanAuthorizationEntry[] = simResult.result?.auth ?? [];
    const signedAuth = await Promise.all(
      rawAuth.map(async (entry) => {
        const credentials = entry.credentials();
        if (credentials.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()) {
          return entry; // source-account auth; covered by tx signature
        }
        const entryAddress = Address.fromScAddress(
          credentials.address().address(),
        ).toString();

        const matchingSigner = signers.find((kp) => kp.publicKey() === entryAddress);
        if (!matchingSigner) return entry; // admin or already covered

        return authorizeEntry(entry, matchingSigner, validUntil, this.networkPassphrase);
      }),
    );

    // Assemble: inject soroban data (resource fee, footprint) + signed auth.
    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
    assembled.operations[0] = xdr.Operation.fromXDR(
      xdr.Operation.toXDR(assembled.operations[0]),
    );

    // Overwrite auth entries with our signed versions.
    const opBody = assembled.operations[0].body().invokeHostFunction();
    opBody.auth(signedAuth);

    // Admin signs the transaction envelope.
    assembled.sign(this.adminKeypair);
    // Extra signers sign if the network requires it (multi-sig envelope).
    for (const signer of signers) {
      if (signer.publicKey() !== this.adminKeypair.publicKey()) {
        assembled.sign(signer);
      }
    }

    const submitResult = await this.server.sendTransaction(assembled);
    if (submitResult.status === 'ERROR') {
      const err = submitResult.errorResult?.toXDR('base64') ?? 'unknown error';
      throw new Error(`Transaction ${method} failed: ${err}`);
    }

    return this.waitForTransaction(submitResult.hash);
  }

  private async waitForTransaction(hash: string, attempts = 30): Promise<string> {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const result = await this.server.getTransaction(hash);

      if (result.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        this.logger.log(`Tx ${hash} confirmed`);
        return hash;
      }
      if (result.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction ${hash} failed on-chain`);
      }
    }
    throw new Error(`Transaction ${hash} timed out after ${attempts}s`);
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  private escrowIdToBytes(escrowId: string): Buffer {
    // UUID v4 → strip hyphens → hex → Buffer (16 bytes)
    return Buffer.from(escrowId.replace(/-/g, ''), 'hex');
  }

  get adminPublicKey(): string {
    return this.adminKeypair.publicKey();
  }
}
