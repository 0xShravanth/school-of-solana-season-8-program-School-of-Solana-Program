
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { assert } from "chai";
import { Escrow } from "../target/types/escrow";

describe("escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Escrow as Program<Escrow>;
  const connection = provider.connection;

  const maker = provider.wallet.payer as Keypair;
  const taker = Keypair.generate();

  const amountA = new anchor.BN(500_000_000); 
  const amountB = new anchor.BN(200_000_000); 

  let escrowPda: PublicKey;
  let escrowBump: number;
  let escrowId: number;
  let expiryTs: anchor.BN;

  let nextEscrowId = 1;

  const deriveEscrowPda = (makerKey: PublicKey, id: number) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("escrow"),
        makerKey.toBuffer(),
        new anchor.BN(id).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

  before(async () => {
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: maker.publicKey,
        toPubkey: taker.publicKey,
        lamports: 2 * LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(transferTx);
  });

  it("creates escrow and locks maker funds", async () => {
    escrowId = nextEscrowId++;
    [escrowPda, escrowBump] = deriveEscrowPda(maker.publicKey, escrowId);
    expiryTs = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    await program.methods
      .createEscrow(
        new anchor.BN(escrowId),
        amountA,
        amountB,
        expiryTs,
        taker.publicKey
      )
      .accounts({
        escrow: escrowPda,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(escrowPda);

    assert.equal(escrowAccount.maker.toString(), maker.publicKey.toString());
    assert.equal(escrowAccount.taker?.toString(), taker.publicKey.toString());
    assert.equal(escrowAccount.amountA.toString(), amountA.toString());
    assert.equal(escrowAccount.amountBExpected.toString(), amountB.toString());
    assert.equal(escrowAccount.escrowId.toNumber(), escrowId);
    assert.isTrue(escrowAccount.isActive);
    assert.isFalse(escrowAccount.isFunded);
    assert.equal(escrowAccount.bump, escrowBump);
  });

  it("allows taker to fund the escrow", async () => {
    const escrowBalanceBefore = await connection.getBalance(escrowPda);

    await program.methods
      .fundEscrow()
      .accounts({
        escrow: escrowPda,
        taker: taker.publicKey,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([taker])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(escrowPda);
    assert.isTrue(escrowAccount.isFunded);
    assert.equal(escrowAccount.taker?.toString(), taker.publicKey.toString());

    const escrowBalanceAfter = await connection.getBalance(escrowPda);
    assert.equal(
      escrowBalanceAfter,
      escrowBalanceBefore + amountB.toNumber()
    );
  });

  it("completes swap and releases funds", async () => {
    const escrowBalanceBefore = await connection.getBalance(escrowPda);

    await program.methods
      .completeSwap()
      .accounts({
        escrow: escrowPda,
        taker: taker.publicKey,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([taker])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(escrowPda);
    assert.isTrue(escrowAccount.isCompleted);
    assert.isFalse(escrowAccount.isActive);
    assert.isFalse(escrowAccount.isFunded);
    assert.isNull(escrowAccount.taker);

    const escrowBalanceAfter = await connection.getBalance(escrowPda);
    assert.equal(
      escrowBalanceBefore - escrowBalanceAfter,
      amountA.toNumber() + amountB.toNumber()
    );
  });

  it("allows maker to cancel an unfunded escrow", async () => {
    const cancelEscrowId = nextEscrowId++;
    const [cancelPda] = deriveEscrowPda(maker.publicKey, cancelEscrowId);
    const cancelExpiry = new anchor.BN(Math.floor(Date.now() / 1000) + 600);

    await program.methods
      .createEscrow(
        new anchor.BN(cancelEscrowId),
        amountA,
        amountB,
        cancelExpiry,
        taker.publicKey
      )
      .accounts({
        escrow: cancelPda,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc();

    await program.methods
      .cancelEscrow()
      .accounts({
        escrow: cancelPda,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(cancelPda);
    assert.isFalse(escrowAccount.isActive);
    assert.isFalse(escrowAccount.isFunded);
  });

  it("refunds maker after expiry for unfunded escrow", async () => {
    const refundEscrowId = nextEscrowId++;
    const [refundPda] = deriveEscrowPda(maker.publicKey, refundEscrowId);
    const shortExpiry = new anchor.BN(Math.floor(Date.now() / 1000) + 3);

    await program.methods
      .createEscrow(
        new anchor.BN(refundEscrowId),
        amountA,
        amountB,
        shortExpiry,
        taker.publicKey
      )
      .accounts({
        escrow: refundPda,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc();

    await new Promise((resolve) => setTimeout(resolve, 4000));

    await program.methods
      .refundAfterExpiry()
      .accounts({
        escrow: refundPda,
        maker: maker.publicKey,
        systemProgram: SystemProgram.programId,
      } as any)
      .signers([maker])
      .rpc();

    const escrowAccount = await program.account.escrowAccount.fetch(refundPda);
    assert.isFalse(escrowAccount.isActive);
    assert.isFalse(escrowAccount.isFunded);
  });
});