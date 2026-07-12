const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const VERIFY_WINDOW = 24 * 60 * 60; // 24h: setelah ini worker bisa forceRelease
const BOUNTY = 500000n; // Rp 5.000,00 (IDRX 2 desimal)
const SPEC_HASH = ethers.keccak256(ethers.toUtf8Bytes("spec-v1"));
const PROOF_HASH = ethers.keccak256(ethers.toUtf8Bytes("proof-photo-1"));

describe("TaskEscrow", function () {
  async function deployFixture() {
    const [deployer, agent, worker, other, relayer] = await ethers.getSigners();

    const MockIDRX = await ethers.getContractFactory("MockIDRX");
    const idrx = await MockIDRX.deploy();

    const TaskEscrow = await ethers.getContractFactory("TaskEscrow");
    const escrow = await TaskEscrow.deploy(relayer.address, VERIFY_WINDOW);

    await idrx.mint(agent.address, BOUNTY * 100n);
    await idrx.connect(agent).approve(await escrow.getAddress(), BOUNTY * 100n);

    const deadline = (await time.latest()) + 3600;
    return { escrow, idrx, agent, worker, other, relayer, deadline };
  }

  async function postedFixture() {
    const ctx = await deployFixture();
    await ctx.escrow
      .connect(ctx.agent)
      .postTask(await ctx.idrx.getAddress(), BOUNTY, SPEC_HASH, ctx.deadline);
    return { ...ctx, taskId: 0n };
  }

  async function submittedFixture() {
    const ctx = await postedFixture();
    await ctx.escrow.connect(ctx.worker).claimTask(ctx.taskId);
    await ctx.escrow.connect(ctx.worker).submitProof(ctx.taskId, PROOF_HASH);
    return ctx;
  }

  // Status enum harus sinkron dengan kontrak
  const Status = { None: 0n, Open: 1n, Claimed: 2n, Submitted: 3n, Paid: 4n, Refunded: 5n };

  describe("postTask", function () {
    it("mengunci bounty di escrow dan menyimpan task dengan benar", async function () {
      const { escrow, idrx, agent, deadline } = await loadFixture(deployFixture);
      const tokenAddr = await idrx.getAddress();

      await escrow.connect(agent).postTask(tokenAddr, BOUNTY, SPEC_HASH, deadline);

      expect(await idrx.balanceOf(await escrow.getAddress())).to.equal(BOUNTY);
      const task = await escrow.getTask(0);
      expect(task.agent).to.equal(agent.address);
      expect(task.token).to.equal(tokenAddr);
      expect(task.bounty).to.equal(BOUNTY);
      expect(task.specHash).to.equal(SPEC_HASH);
      expect(task.deadline).to.equal(deadline);
      expect(task.status).to.equal(Status.Open);
    });

    it("emit TaskPosted", async function () {
      const { escrow, idrx, agent, deadline } = await loadFixture(deployFixture);
      await expect(escrow.connect(agent).postTask(await idrx.getAddress(), BOUNTY, SPEC_HASH, deadline))
        .to.emit(escrow, "TaskPosted")
        .withArgs(0, agent.address, await idrx.getAddress(), BOUNTY, SPEC_HASH, deadline);
    });

    it("taskId inkremental", async function () {
      const { escrow, idrx, agent, deadline } = await loadFixture(deployFixture);
      const tokenAddr = await idrx.getAddress();
      await escrow.connect(agent).postTask(tokenAddr, BOUNTY, SPEC_HASH, deadline);
      await expect(escrow.connect(agent).postTask(tokenAddr, BOUNTY, SPEC_HASH, deadline))
        .to.emit(escrow, "TaskPosted")
        .withArgs(1, agent.address, tokenAddr, BOUNTY, SPEC_HASH, deadline);
    });

    it("revert kalau bounty nol", async function () {
      const { escrow, idrx, agent, deadline } = await loadFixture(deployFixture);
      await expect(
        escrow.connect(agent).postTask(await idrx.getAddress(), 0, SPEC_HASH, deadline)
      ).to.be.revertedWithCustomError(escrow, "ZeroBounty");
    });

    it("revert kalau deadline sudah lewat", async function () {
      const { escrow, idrx, agent } = await loadFixture(deployFixture);
      const past = (await time.latest()) - 1;
      await expect(
        escrow.connect(agent).postTask(await idrx.getAddress(), BOUNTY, SPEC_HASH, past)
      ).to.be.revertedWithCustomError(escrow, "BadDeadline");
    });
  });

  describe("claimTask", function () {
    it("worker meng-claim task Open", async function () {
      const { escrow, worker, taskId } = await loadFixture(postedFixture);
      await expect(escrow.connect(worker).claimTask(taskId))
        .to.emit(escrow, "TaskClaimed")
        .withArgs(taskId, worker.address);
      const task = await escrow.getTask(taskId);
      expect(task.worker).to.equal(worker.address);
      expect(task.status).to.equal(Status.Claimed);
    });

    it("revert double-claim", async function () {
      const { escrow, worker, other, taskId } = await loadFixture(postedFixture);
      await escrow.connect(worker).claimTask(taskId);
      await expect(escrow.connect(other).claimTask(taskId)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState"
      );
    });

    it("revert claim setelah deadline", async function () {
      const { escrow, worker, taskId, deadline } = await loadFixture(postedFixture);
      await time.increaseTo(deadline + 1);
      await expect(escrow.connect(worker).claimTask(taskId)).to.be.revertedWithCustomError(
        escrow,
        "DeadlinePassed"
      );
    });

    it("claimFor: relayer bisa claim atas nama worker (worker tanpa gas)", async function () {
      const { escrow, worker, relayer, taskId } = await loadFixture(postedFixture);
      await escrow.connect(relayer).claimFor(taskId, worker.address);
      expect((await escrow.getTask(taskId)).worker).to.equal(worker.address);
    });

    it("claimFor: non-relayer ditolak", async function () {
      const { escrow, worker, other, taskId } = await loadFixture(postedFixture);
      await expect(
        escrow.connect(other).claimFor(taskId, worker.address)
      ).to.be.revertedWithCustomError(escrow, "NotRelayer");
    });
  });

  describe("submitProof", function () {
    it("worker submit bukti: simpan proofHash + submittedAt", async function () {
      const { escrow, worker, taskId } = await loadFixture(postedFixture);
      await escrow.connect(worker).claimTask(taskId);
      await expect(escrow.connect(worker).submitProof(taskId, PROOF_HASH))
        .to.emit(escrow, "ProofSubmitted")
        .withArgs(taskId, worker.address, PROOF_HASH);
      const task = await escrow.getTask(taskId);
      expect(task.proofHash).to.equal(PROOF_HASH);
      expect(task.submittedAt).to.equal(await time.latest());
      expect(task.status).to.equal(Status.Submitted);
    });

    it("revert kalau bukan worker yang claim", async function () {
      const { escrow, worker, other, taskId } = await loadFixture(postedFixture);
      await escrow.connect(worker).claimTask(taskId);
      await expect(
        escrow.connect(other).submitProof(taskId, PROOF_HASH)
      ).to.be.revertedWithCustomError(escrow, "NotWorker");
    });

    it("revert submit dari status Open", async function () {
      const { escrow, worker, taskId } = await loadFixture(postedFixture);
      await expect(
        escrow.connect(worker).submitProof(taskId, PROOF_HASH)
      ).to.be.revertedWithCustomError(escrow, "InvalidState");
    });

    it("submitProofFor: relayer atas nama worker; non-relayer ditolak", async function () {
      const { escrow, worker, other, relayer, taskId } = await loadFixture(postedFixture);
      await escrow.connect(relayer).claimFor(taskId, worker.address);
      await expect(
        escrow.connect(other).submitProofFor(taskId, worker.address, PROOF_HASH)
      ).to.be.revertedWithCustomError(escrow, "NotRelayer");
      await escrow.connect(relayer).submitProofFor(taskId, worker.address, PROOF_HASH);
      expect((await escrow.getTask(taskId)).status).to.equal(Status.Submitted);
    });

    it("submitProofFor: revert kalau worker param bukan worker task", async function () {
      const { escrow, worker, other, relayer, taskId } = await loadFixture(postedFixture);
      await escrow.connect(relayer).claimFor(taskId, worker.address);
      await expect(
        escrow.connect(relayer).submitProofFor(taskId, other.address, PROOF_HASH)
      ).to.be.revertedWithCustomError(escrow, "NotWorker");
    });
  });

  describe("releaseBounty", function () {
    it("agent membayar worker: Submitted -> Paid", async function () {
      const { escrow, idrx, agent, worker, taskId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(agent).releaseBounty(taskId))
        .to.emit(escrow, "BountyReleased")
        .withArgs(taskId, worker.address, BOUNTY);
      expect(await idrx.balanceOf(worker.address)).to.equal(BOUNTY);
      expect((await escrow.getTask(taskId)).status).to.equal(Status.Paid);
    });

    it("revert kalau bukan agent pemilik task", async function () {
      const { escrow, other, taskId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(other).releaseBounty(taskId)).to.be.revertedWithCustomError(
        escrow,
        "NotAgent"
      );
    });

    it("revert release sebelum ada proof (status Claimed)", async function () {
      const { escrow, agent, worker, taskId } = await loadFixture(postedFixture);
      await escrow.connect(worker).claimTask(taskId);
      await expect(escrow.connect(agent).releaseBounty(taskId)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState"
      );
    });

    it("revert double release", async function () {
      const { escrow, agent, taskId } = await loadFixture(submittedFixture);
      await escrow.connect(agent).releaseBounty(taskId);
      await expect(escrow.connect(agent).releaseBounty(taskId)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState"
      );
    });
  });

  describe("rejectAndReopen", function () {
    it("agent menolak bukti: task kembali Open, worker lain bisa claim", async function () {
      const { escrow, agent, other, taskId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(agent).rejectAndReopen(taskId))
        .to.emit(escrow, "TaskReopened")
        .withArgs(taskId);
      const task = await escrow.getTask(taskId);
      expect(task.status).to.equal(Status.Open);
      expect(task.worker).to.equal(ethers.ZeroAddress);
      expect(task.proofHash).to.equal(ethers.ZeroHash);
      expect(task.submittedAt).to.equal(0);

      await escrow.connect(other).claimTask(taskId);
      expect((await escrow.getTask(taskId)).worker).to.equal(other.address);
    });

    it("revert kalau bukan agent", async function () {
      const { escrow, other, taskId } = await loadFixture(submittedFixture);
      await expect(escrow.connect(other).rejectAndReopen(taskId)).to.be.revertedWithCustomError(
        escrow,
        "NotAgent"
      );
    });
  });

  describe("refundExpired", function () {
    it("refund dari Open setelah deadline: dana kembali ke agent", async function () {
      const { escrow, idrx, agent, taskId, deadline } = await loadFixture(postedFixture);
      const before = await idrx.balanceOf(agent.address);
      await time.increaseTo(deadline + 1);
      await expect(escrow.refundExpired(taskId)).to.emit(escrow, "TaskRefunded").withArgs(taskId);
      expect(await idrx.balanceOf(agent.address)).to.equal(before + BOUNTY);
      expect((await escrow.getTask(taskId)).status).to.equal(Status.Refunded);
    });

    it("refund dari Claimed setelah deadline", async function () {
      const { escrow, worker, taskId, deadline } = await loadFixture(postedFixture);
      await escrow.connect(worker).claimTask(taskId);
      await time.increaseTo(deadline + 1);
      await escrow.refundExpired(taskId);
      expect((await escrow.getTask(taskId)).status).to.equal(Status.Refunded);
    });

    it("revert sebelum deadline", async function () {
      const { escrow, taskId } = await loadFixture(postedFixture);
      await expect(escrow.refundExpired(taskId)).to.be.revertedWithCustomError(
        escrow,
        "DeadlineNotPassed"
      );
    });

    it("revert kalau sudah ada proof tersubmit (agen tidak bisa kabur dari kewajiban)", async function () {
      const { escrow, taskId, deadline } = await loadFixture(submittedFixture);
      await time.increaseTo(deadline + 1);
      await expect(escrow.refundExpired(taskId)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState"
      );
    });
  });

  describe("forceRelease (perlindungan worker — anti kasus Remotasks)", function () {
    it("worker tetap dibayar kalau agent diam melewati verifyWindow", async function () {
      const { escrow, idrx, worker, taskId } = await loadFixture(submittedFixture);
      const submittedAt = (await escrow.getTask(taskId)).submittedAt;
      await time.increaseTo(submittedAt + BigInt(VERIFY_WINDOW) + 1n);
      await expect(escrow.forceRelease(taskId))
        .to.emit(escrow, "BountyReleased")
        .withArgs(taskId, worker.address, BOUNTY);
      expect(await idrx.balanceOf(worker.address)).to.equal(BOUNTY);
      expect((await escrow.getTask(taskId)).status).to.equal(Status.Paid);
    });

    it("revert selama verifyWindow masih berjalan", async function () {
      const { escrow, taskId } = await loadFixture(submittedFixture);
      await expect(escrow.forceRelease(taskId)).to.be.revertedWithCustomError(
        escrow,
        "VerifyWindowActive"
      );
    });

    it("revert kalau status bukan Submitted", async function () {
      const { escrow, taskId } = await loadFixture(postedFixture);
      await expect(escrow.forceRelease(taskId)).to.be.revertedWithCustomError(
        escrow,
        "InvalidState"
      );
    });
  });
});
