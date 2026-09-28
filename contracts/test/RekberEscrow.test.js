const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// Status: None, Funded, Shipped, Disputed, Escalated, Released, Refunded, Split
const Status = { None: 0n, Funded: 1n, Shipped: 2n, Disputed: 3n, Escalated: 4n, Released: 5n, Refunded: 6n, Split: 7n };
// Action: Ship, Confirm, Dispute
const Action = { Ship: 0, Confirm: 1, Dispute: 2 };
// SettleReason: BuyerConfirmed, ConfirmTimeout, ShipTimeout, AiVerdict, HumanVerdict
const Reason = { BuyerConfirmed: 0n, ConfirmTimeout: 1n, ShipTimeout: 2n, AiVerdict: 3n, HumanVerdict: 4n };

const FEE_BPS = 100; // 1%
const SHIP_WINDOW = 1800;
const CONFIRM_WINDOW = 600;
const DISPUTE_WINDOW = 1800;
const AMOUNT = 8_500_000n; // Rp8.500.000 (token 0 desimal)
const ZERO_HASH = ethers.ZeroHash;

function dealId(label) {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}
const SPEC_HASH = ethers.keccak256(ethers.toUtf8Bytes("spec-v1"));
const SHIPMENT_HASH = ethers.keccak256(ethers.toUtf8Bytes("shipment-v1"));
const DISPUTE_HASH = ethers.keccak256(ethers.toUtf8Bytes("dispute-v1"));
const VERDICT_HASH = ethers.keccak256(ethers.toUtf8Bytes("verdict-v1"));

describe("RekberEscrow", function () {
  async function deployFixture() {
    const [deployer, buyer, seller, feeRecipient, aiArbiter, humanArbiter, other] = await ethers.getSigners();

    const token = await (await ethers.getContractFactory("MockIDRX")).deploy();
    const Escrow = await ethers.getContractFactory("RekberEscrow");
    const escrow = await Escrow.deploy(
      await token.getAddress(),
      aiArbiter.address,
      humanArbiter.address,
      feeRecipient.address,
      FEE_BPS,
      SHIP_WINDOW,
      CONFIRM_WINDOW,
      DISPUTE_WINDOW,
    );

    await token.mint(buyer.address, AMOUNT * 10n);
    await token.connect(buyer).approve(await escrow.getAddress(), AMOUNT * 10n);

    const escrowAddr = await escrow.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name: "RekberEscrow", version: "1", chainId, verifyingContract: escrowAddr };

    return { escrow, token, deployer, buyer, seller, feeRecipient, aiArbiter, humanArbiter, other, domain };
  }

  async function signOffer(signer, domain, { id, sellerAddr, amount, specHash, offerDeadline }) {
    const types = {
      Offer: [
        { name: "dealId", type: "bytes32" },
        { name: "seller", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "specHash", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, { dealId: id, seller: sellerAddr, amount, specHash, deadline: offerDeadline });
  }

  async function signFund(signer, domain, { id, buyerAddr, sellerAddr, amount, specHash, deadline }) {
    const types = {
      Fund: [
        { name: "dealId", type: "bytes32" },
        { name: "buyer", type: "address" },
        { name: "seller", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "specHash", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, { dealId: id, buyer: buyerAddr, seller: sellerAddr, amount, specHash, deadline });
  }

  async function signAct(signer, domain, { id, action, data, deadline }) {
    const types = {
      Act: [
        { name: "dealId", type: "bytes32" },
        { name: "action", type: "uint8" },
        { name: "data", type: "bytes32" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, { dealId: id, action, data, deadline });
  }

  async function signPermit(token, owner, spenderAddr, value, deadline) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const nonce = await token.nonces(owner.address);
    const domain = { name: "Mock IDRX", version: "1", chainId, verifyingContract: await token.getAddress() };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const sig = await owner.signTypedData(domain, types, { owner: owner.address, spender: spenderAddr, value, nonce, deadline });
    return ethers.Signature.from(sig);
  }

  async function makeOffer(ctx, { id = dealId("deal-1"), amount = AMOUNT, specHash = SPEC_HASH, offerDeadlineOffset = 3600 } = {}) {
    const offerDeadline = (await time.latest()) + offerDeadlineOffset;
    const sig = await signOffer(ctx.seller, ctx.domain, { id, sellerAddr: ctx.seller.address, amount, specHash, offerDeadline });
    const terms = { dealId: id, seller: ctx.seller.address, amount, specHash, offerDeadline };
    return { terms, offerSig: sig, id };
  }

  /** Post a deal to Funded status via direct fund(). */
  async function fundedFixture() {
    const ctx = await deployFixture();
    const { terms, offerSig, id } = await makeOffer(ctx);
    await ctx.escrow.connect(ctx.buyer).fund(terms, offerSig);
    return { ...ctx, id, terms };
  }

  async function shippedFixture() {
    const ctx = await fundedFixture();
    await ctx.escrow.connect(ctx.seller).ship(ctx.id, SHIPMENT_HASH);
    return ctx;
  }

  async function disputedFixture() {
    const ctx = await shippedFixture();
    await ctx.escrow.connect(ctx.buyer).dispute(ctx.id, DISPUTE_HASH);
    return ctx;
  }

  async function escalatedFixture() {
    const ctx = await disputedFixture();
    await ctx.escrow.connect(ctx.aiArbiter).escalate(ctx.id, VERDICT_HASH);
    return ctx;
  }

  // ───────────────────────── constructor ─────────────────────────
  describe("constructor", function () {
    it("revert kalau feeBps > 500", async function () {
      const [, , , feeRecipient, aiArbiter, humanArbiter] = await ethers.getSigners();
      const token = await (await ethers.getContractFactory("MockIDRX")).deploy();
      const Escrow = await ethers.getContractFactory("RekberEscrow");
      await expect(
        Escrow.deploy(await token.getAddress(), aiArbiter.address, humanArbiter.address, feeRecipient.address, 501, SHIP_WINDOW, CONFIRM_WINDOW, DISPUTE_WINDOW),
      ).to.be.revertedWithCustomError(Escrow, "FeeTooHigh");
    });

    it("revert kalau salah satu alamat nol", async function () {
      const [, , , feeRecipient, aiArbiter, humanArbiter] = await ethers.getSigners();
      const token = await (await ethers.getContractFactory("MockIDRX")).deploy();
      const Escrow = await ethers.getContractFactory("RekberEscrow");
      await expect(
        Escrow.deploy(await token.getAddress(), ethers.ZeroAddress, humanArbiter.address, feeRecipient.address, FEE_BPS, SHIP_WINDOW, CONFIRM_WINDOW, DISPUTE_WINDOW),
      ).to.be.revertedWithCustomError(Escrow, "ZeroAddress");
    });
  });

  // ───────────────────────── fund / fundWithSig ─────────────────────────
  describe("fund", function () {
    it("pembeli mendanai deal: tarik token, status Funded, emit Funded", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, id } = await makeOffer(ctx);
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, offerSig))
        .to.emit(ctx.escrow, "Funded")
        .withArgs(id, ctx.buyer.address, ctx.seller.address, AMOUNT, SPEC_HASH);

      expect(await ctx.token.balanceOf(await ctx.escrow.getAddress())).to.equal(AMOUNT);
      const deal = await ctx.escrow.getDeal(id);
      expect(deal.buyer).to.equal(ctx.buyer.address);
      expect(deal.seller).to.equal(ctx.seller.address);
      expect(deal.amount).to.equal(AMOUNT);
      expect(deal.specHash).to.equal(SPEC_HASH);
      expect(deal.status).to.equal(Status.Funded);
    });

    it("revert dealId sudah dipakai (anti-squat)", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig } = await makeOffer(ctx);
      await ctx.escrow.connect(ctx.buyer).fund(terms, offerSig);
      // seller lain mencoba fund ulang dealId yang sama dengan Offer baru (sah, ditandatangani seller asli)
      const offerDeadline = (await time.latest()) + 3600;
      const sig2 = await signOffer(ctx.seller, ctx.domain, { id: terms.dealId, sellerAddr: ctx.seller.address, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline });
      await expect(
        ctx.escrow.connect(ctx.other).fund({ ...terms, offerDeadline }, sig2),
      ).to.be.revertedWithCustomError(ctx.escrow, "DealExists");
    });

    it("revert amount nol", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig } = await makeOffer(ctx, { amount: 0n });
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, offerSig)).to.be.revertedWithCustomError(ctx.escrow, "ZeroAmount");
    });

    it("revert seller alamat nol", async function () {
      const ctx = await deployFixture();
      const offerDeadline = (await time.latest()) + 3600;
      const terms = { dealId: dealId("d"), seller: ethers.ZeroAddress, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline };
      // signature apa pun (recover tidak akan pernah == address(0) secara wajar) - fokusnya cek ZeroAddress lebih dulu
      const bogusSig = await ctx.seller.signMessage("x");
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, bogusSig)).to.be.revertedWithCustomError(ctx.escrow, "ZeroAddress");
    });

    it("revert seller == buyer (self-deal)", async function () {
      const ctx = await deployFixture();
      const offerDeadline = (await time.latest()) + 3600;
      const sig = await signOffer(ctx.buyer, ctx.domain, { id: dealId("d"), sellerAddr: ctx.buyer.address, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline });
      const terms = { dealId: dealId("d"), seller: ctx.buyer.address, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline };
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, sig)).to.be.revertedWithCustomError(ctx.escrow, "SelfDeal");
    });

    it("Offer: revert kalau ditandatangani bukan seller", async function () {
      const ctx = await deployFixture();
      const offerDeadline = (await time.latest()) + 3600;
      const sig = await signOffer(ctx.other, ctx.domain, { id: dealId("d"), sellerAddr: ctx.seller.address, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline });
      const terms = { dealId: dealId("d"), seller: ctx.seller.address, amount: AMOUNT, specHash: SPEC_HASH, offerDeadline };
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, sig)).to.be.revertedWithCustomError(ctx.escrow, "BadSignature");
    });

    it("Offer: revert kalau field terms diubah dari yang ditandatangani (mis. amount)", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig } = await makeOffer(ctx, { amount: AMOUNT });
      const tampered = { ...terms, amount: AMOUNT * 2n };
      await expect(ctx.escrow.connect(ctx.buyer).fund(tampered, offerSig)).to.be.revertedWithCustomError(ctx.escrow, "BadSignature");
    });

    it("Offer: revert kalau sudah kedaluwarsa", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig } = await makeOffer(ctx, { offerDeadlineOffset: 10 });
      await time.increase(20);
      await expect(ctx.escrow.connect(ctx.buyer).fund(terms, offerSig)).to.be.revertedWithCustomError(ctx.escrow, "SignatureExpired");
    });
  });

  describe("fundWithSig (relayer, gasless)", function () {
    async function relayerFund(ctx, { permit = true } = {}) {
      const { terms, offerSig, id } = await makeOffer(ctx);
      const fundDeadline = (await time.latest()) + 600;
      const fundSig = await signFund(ctx.buyer, ctx.domain, {
        id, buyerAddr: ctx.buyer.address, sellerAddr: ctx.seller.address, amount: AMOUNT, specHash: SPEC_HASH, deadline: fundDeadline,
      });
      let permitSig = "0x";
      const permitDeadline = (await time.latest()) + 600;
      if (permit) {
        const { v, r, s } = await signPermit(ctx.token, ctx.buyer, await ctx.escrow.getAddress(), AMOUNT, permitDeadline);
        permitSig = ethers.solidityPacked(["bytes32", "bytes32", "uint8"], [r, s, v]);
      }
      return { terms, offerSig, fundSig, fundDeadline, permitSig, permitDeadline, id };
    }

    it("relayer (bukan pembeli) mengirim tx dengan permit -> Funded", async function () {
      const ctx = await deployFixture();
      // pembeli TIDAK approve manual — permit yang men-set allowance
      const { terms, offerSig, fundSig, fundDeadline, permitSig, permitDeadline, id } = await relayerFund(ctx);
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.buyer.address, fundDeadline, offerSig, fundSig, permitDeadline, permitSig),
      )
        .to.emit(ctx.escrow, "Funded")
        .withArgs(id, ctx.buyer.address, ctx.seller.address, AMOUNT, SPEC_HASH);
      expect((await ctx.escrow.getDeal(id)).status).to.equal(Status.Funded);
    });

    it("permit yang sudah di-front-run (allowance sudah ada) tetap berhasil fund", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, fundSig, fundDeadline, permitSig, permitDeadline, id } = await relayerFund(ctx);
      // seseorang men-submit permit yang sama duluan (front-run)
      const escrowAddr = await ctx.escrow.getAddress();
      const sigObj = ethers.Signature.from(
        ethers.hexlify(ethers.concat([ethers.dataSlice(permitSig, 0, 32), ethers.dataSlice(permitSig, 32, 64), ethers.dataSlice(permitSig, 64, 65)])),
      );
      await ctx.token.connect(ctx.other).permit(ctx.buyer.address, escrowAddr, AMOUNT, permitDeadline, sigObj.v, sigObj.r, sigObj.s);
      // fundWithSig tetap berhasil karena permit() dipanggil dalam try/catch
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.buyer.address, fundDeadline, offerSig, fundSig, permitDeadline, permitSig),
      ).to.emit(ctx.escrow, "Funded");
    });

    it("permitSig kosong (v==0 / tanpa permit): berhasil fund kalau pembeli sudah approve manual", async function () {
      const ctx = await deployFixture();
      await ctx.token.connect(ctx.buyer).approve(await ctx.escrow.getAddress(), AMOUNT);
      const { terms, offerSig, fundSig, fundDeadline, permitDeadline, id } = await relayerFund(ctx, { permit: false });
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.buyer.address, fundDeadline, offerSig, fundSig, permitDeadline, "0x"),
      ).to.emit(ctx.escrow, "Funded");
      expect((await ctx.escrow.getDeal(id)).status).to.equal(Status.Funded);
    });

    it("Fund: revert kalau ditandatangani bukan buyer", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, fundDeadline, permitSig, permitDeadline } = await relayerFund(ctx);
      const badFundSig = await signFund(ctx.other, ctx.domain, {
        id: terms.dealId, buyerAddr: ctx.buyer.address, sellerAddr: ctx.seller.address, amount: AMOUNT, specHash: SPEC_HASH, deadline: fundDeadline,
      });
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.buyer.address, fundDeadline, offerSig, badFundSig, permitDeadline, permitSig),
      ).to.be.revertedWithCustomError(ctx.escrow, "BadSignature");
    });

    it("Fund: relayer mengganti buyer di parameter -> BadSignature (signature terikat ke buyer asli)", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, fundSig, fundDeadline, permitSig, permitDeadline } = await relayerFund(ctx);
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.other.address, fundDeadline, offerSig, fundSig, permitDeadline, permitSig),
      ).to.be.revertedWithCustomError(ctx.escrow, "BadSignature");
    });

    it("Fund: revert kalau fundDeadline sudah lewat", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, fundSig, permitSig, permitDeadline } = await relayerFund(ctx);
      const pastDeadline = (await time.latest()) - 1;
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(terms, ctx.buyer.address, pastDeadline, offerSig, fundSig, permitDeadline, permitSig),
      ).to.be.revertedWithCustomError(ctx.escrow, "SignatureExpired");
    });

    it("replay: fundSig yang sama dipakai dua kali -> kedua kalinya DealExists (state sudah berubah)", async function () {
      const ctx = await deployFixture();
      const args = await relayerFund(ctx);
      await ctx.escrow.connect(ctx.other).fundWithSig(
        args.terms, ctx.buyer.address, args.fundDeadline, args.offerSig, args.fundSig, args.permitDeadline, args.permitSig,
      );
      await expect(
        ctx.escrow.connect(ctx.other).fundWithSig(
          args.terms, ctx.buyer.address, args.fundDeadline, args.offerSig, args.fundSig, args.permitDeadline, args.permitSig,
        ),
      ).to.be.revertedWithCustomError(ctx.escrow, "DealExists");
    });
  });

  // ───────────────────────── ship ─────────────────────────
  describe("ship", function () {
    it("penjual mengirim: status Shipped, emit Shipped", async function () {
      const ctx = await fundedFixture();
      await expect(ctx.escrow.connect(ctx.seller).ship(ctx.id, SHIPMENT_HASH))
        .to.emit(ctx.escrow, "Shipped")
        .withArgs(ctx.id, SHIPMENT_HASH);
      const deal = await ctx.escrow.getDeal(ctx.id);
      expect(deal.status).to.equal(Status.Shipped);
      expect(deal.shipmentHash).to.equal(SHIPMENT_HASH);
    });

    it("revert kalau bukan penjual", async function () {
      const ctx = await fundedFixture();
      await expect(ctx.escrow.connect(ctx.other).ship(ctx.id, SHIPMENT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "NotSeller");
    });

    it("revert kalau status bukan Funded", async function () {
      const ctx = await deployFixture();
      await expect(ctx.escrow.connect(ctx.seller).ship(dealId("belum-ada"), SHIPMENT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });

    it("revert kalau shipmentHash kosong", async function () {
      const ctx = await fundedFixture();
      await expect(ctx.escrow.connect(ctx.seller).ship(ctx.id, ZERO_HASH)).to.be.revertedWithCustomError(ctx.escrow, "ZeroHash");
    });

    it("revert kalau melewati shipWindow", async function () {
      const ctx = await fundedFixture();
      await time.increase(SHIP_WINDOW + 1);
      await expect(ctx.escrow.connect(ctx.seller).ship(ctx.id, SHIPMENT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "WindowClosed");
    });

    it("act(Ship) lewat relayer dengan tanda tangan penjual", async function () {
      const ctx = await fundedFixture();
      const deadline = (await time.latest()) + 300;
      const sig = await signAct(ctx.seller, ctx.domain, { id: ctx.id, action: Action.Ship, data: SHIPMENT_HASH, deadline });
      await expect(ctx.escrow.connect(ctx.other).act(ctx.id, Action.Ship, SHIPMENT_HASH, deadline, sig))
        .to.emit(ctx.escrow, "Shipped")
        .withArgs(ctx.id, SHIPMENT_HASH);
    });

    it("act(Ship): revert kalau ditandatangani bukan penjual", async function () {
      const ctx = await fundedFixture();
      const deadline = (await time.latest()) + 300;
      const sig = await signAct(ctx.other, ctx.domain, { id: ctx.id, action: Action.Ship, data: SHIPMENT_HASH, deadline });
      await expect(ctx.escrow.connect(ctx.other).act(ctx.id, Action.Ship, SHIPMENT_HASH, deadline, sig)).to.be.revertedWithCustomError(ctx.escrow, "NotSeller");
    });

    it("act: revert kalau deadline kedaluwarsa", async function () {
      const ctx = await fundedFixture();
      const deadline = (await time.latest()) - 1;
      const sig = await signAct(ctx.seller, ctx.domain, { id: ctx.id, action: Action.Ship, data: SHIPMENT_HASH, deadline });
      await expect(ctx.escrow.connect(ctx.other).act(ctx.id, Action.Ship, SHIPMENT_HASH, deadline, sig)).to.be.revertedWithCustomError(ctx.escrow, "SignatureExpired");
    });

    it("replay act(Ship) setelah status berubah -> InvalidState", async function () {
      const ctx = await fundedFixture();
      const deadline = (await time.latest()) + 300;
      const sig = await signAct(ctx.seller, ctx.domain, { id: ctx.id, action: Action.Ship, data: SHIPMENT_HASH, deadline });
      await ctx.escrow.connect(ctx.other).act(ctx.id, Action.Ship, SHIPMENT_HASH, deadline, sig);
      await expect(ctx.escrow.connect(ctx.other).act(ctx.id, Action.Ship, SHIPMENT_HASH, deadline, sig)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });
  });

  // ───────────────────────── confirm ─────────────────────────
  describe("confirm", function () {
    it("pembeli konfirmasi: bayar penjual dikurangi fee, emit Released", async function () {
      const ctx = await shippedFixture();
      const fee = (AMOUNT * BigInt(FEE_BPS)) / 10000n;
      const sellerAmount = AMOUNT - fee;
      await expect(ctx.escrow.connect(ctx.buyer).confirm(ctx.id))
        .to.emit(ctx.escrow, "Released")
        .withArgs(ctx.id, sellerAmount, fee, Reason.BuyerConfirmed, ZERO_HASH);
      expect(await ctx.token.balanceOf(ctx.seller.address)).to.equal(sellerAmount);
      expect(await ctx.token.balanceOf(ctx.feeRecipient.address)).to.equal(fee);
      expect((await ctx.escrow.getDeal(ctx.id)).status).to.equal(Status.Released);
    });

    it("revert kalau bukan pembeli", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.connect(ctx.other).confirm(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "NotBuyer");
    });

    it("revert kalau status bukan Shipped", async function () {
      const ctx = await fundedFixture();
      await expect(ctx.escrow.connect(ctx.buyer).confirm(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });

    it("act(Confirm) lewat relayer", async function () {
      const ctx = await shippedFixture();
      const deadline = (await time.latest()) + 300;
      const sig = await signAct(ctx.buyer, ctx.domain, { id: ctx.id, action: Action.Confirm, data: ZERO_HASH, deadline });
      await expect(ctx.escrow.connect(ctx.other).act(ctx.id, Action.Confirm, ZERO_HASH, deadline, sig)).to.emit(ctx.escrow, "Released");
    });
  });

  // ───────────────────────── dispute ─────────────────────────
  describe("dispute", function () {
    it("pembeli komplain: status Disputed, emit Disputed", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.connect(ctx.buyer).dispute(ctx.id, DISPUTE_HASH)).to.emit(ctx.escrow, "Disputed").withArgs(ctx.id, DISPUTE_HASH);
      const deal = await ctx.escrow.getDeal(ctx.id);
      expect(deal.status).to.equal(Status.Disputed);
      expect(deal.disputeHash).to.equal(DISPUTE_HASH);
    });

    it("revert kalau bukan pembeli", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.connect(ctx.other).dispute(ctx.id, DISPUTE_HASH)).to.be.revertedWithCustomError(ctx.escrow, "NotBuyer");
    });

    it("revert kalau disputeHash kosong", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.connect(ctx.buyer).dispute(ctx.id, ZERO_HASH)).to.be.revertedWithCustomError(ctx.escrow, "ZeroHash");
    });

    it("revert kalau melewati confirmWindow", async function () {
      const ctx = await shippedFixture();
      await time.increase(CONFIRM_WINDOW + 1);
      await expect(ctx.escrow.connect(ctx.buyer).dispute(ctx.id, DISPUTE_HASH)).to.be.revertedWithCustomError(ctx.escrow, "WindowClosed");
    });
  });

  // ───────────────────────── resolve / escalate ─────────────────────────
  describe("resolve (aiArbiter, status Disputed)", function () {
    it("aiArbiter -> RELEASE: bayar penjual, reason AiVerdict, simpan verdictHash", async function () {
      const ctx = await disputedFixture();
      const fee = (AMOUNT * BigInt(FEE_BPS)) / 10000n;
      const sellerAmount = AMOUNT - fee;
      await expect(ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, false, VERDICT_HASH))
        .to.emit(ctx.escrow, "Released")
        .withArgs(ctx.id, sellerAmount, fee, Reason.AiVerdict, VERDICT_HASH);
      const deal = await ctx.escrow.getDeal(ctx.id);
      expect(deal.status).to.equal(Status.Released);
      expect(deal.verdictHash).to.equal(VERDICT_HASH);
    });

    it("aiArbiter -> REFUND: kembalikan penuh ke pembeli, tanpa fee", async function () {
      const ctx = await disputedFixture();
      const before = await ctx.token.balanceOf(ctx.buyer.address);
      await expect(ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, true, VERDICT_HASH))
        .to.emit(ctx.escrow, "Refunded")
        .withArgs(ctx.id, AMOUNT, Reason.AiVerdict, VERDICT_HASH);
      expect(await ctx.token.balanceOf(ctx.buyer.address)).to.equal(before + AMOUNT);
      expect(await ctx.token.balanceOf(ctx.feeRecipient.address)).to.equal(0n);
    });

    it("revert kalau verdictHash kosong", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, true, ZERO_HASH)).to.be.revertedWithCustomError(ctx.escrow, "ZeroHash");
    });

    it("bukan arbiter -> NotArbiter", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.connect(ctx.other).resolve(ctx.id, true, VERDICT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "NotArbiter");
    });

    it("aiArbiter TIDAK BISA resolve status Escalated", async function () {
      const ctx = await escalatedFixture();
      await expect(ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, true, VERDICT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });

    it("humanArbiter BISA resolve status Escalated, reason HumanVerdict", async function () {
      const ctx = await escalatedFixture();
      await expect(ctx.escrow.connect(ctx.humanArbiter).resolve(ctx.id, true, VERDICT_HASH))
        .to.emit(ctx.escrow, "Refunded")
        .withArgs(ctx.id, AMOUNT, Reason.HumanVerdict, VERDICT_HASH);
    });

    it("humanArbiter BISA resolve status Disputed langsung (tanpa lewat Escalated)", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.connect(ctx.humanArbiter).resolve(ctx.id, false, VERDICT_HASH)).to.emit(ctx.escrow, "Released");
    });

    it("revert double resolve (sudah Released)", async function () {
      const ctx = await disputedFixture();
      await ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, false, VERDICT_HASH);
      await expect(ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, false, VERDICT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });
  });

  describe("escalate (aiArbiter, status Disputed)", function () {
    it("aiArbiter mengeskalasi: status Escalated, emit Escalated", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.connect(ctx.aiArbiter).escalate(ctx.id, VERDICT_HASH)).to.emit(ctx.escrow, "Escalated").withArgs(ctx.id, VERDICT_HASH);
      const deal = await ctx.escrow.getDeal(ctx.id);
      expect(deal.status).to.equal(Status.Escalated);
      expect(deal.verdictHash).to.equal(VERDICT_HASH);
    });

    it("bukan aiArbiter -> NotArbiter (humanArbiter pun tidak bisa escalate)", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.connect(ctx.humanArbiter).escalate(ctx.id, VERDICT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "NotArbiter");
    });

    it("revert kalau status bukan Disputed", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.connect(ctx.aiArbiter).escalate(ctx.id, VERDICT_HASH)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });
  });

  // ───────────────────────── timeouts ─────────────────────────
  describe("refundUnshipped", function () {
    it("revert sebelum shipWindow lewat", async function () {
      const ctx = await fundedFixture();
      await expect(ctx.escrow.refundUnshipped(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "WindowStillOpen");
    });

    it("siapa pun bisa memicu refund setelah shipWindow lewat", async function () {
      const ctx = await fundedFixture();
      await time.increase(SHIP_WINDOW + 1);
      const before = await ctx.token.balanceOf(ctx.buyer.address);
      await expect(ctx.escrow.connect(ctx.other).refundUnshipped(ctx.id))
        .to.emit(ctx.escrow, "Refunded")
        .withArgs(ctx.id, AMOUNT, Reason.ShipTimeout, ZERO_HASH);
      expect(await ctx.token.balanceOf(ctx.buyer.address)).to.equal(before + AMOUNT);
    });

    it("revert kalau status bukan Funded", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.refundUnshipped(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });
  });

  describe("releaseUnconfirmed", function () {
    it("revert sebelum confirmWindow lewat", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.releaseUnconfirmed(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "WindowStillOpen");
    });

    it("siapa pun bisa memicu pencairan ke penjual setelah confirmWindow lewat (pembeli diam)", async function () {
      const ctx = await shippedFixture();
      await time.increase(CONFIRM_WINDOW + 1);
      const fee = (AMOUNT * BigInt(FEE_BPS)) / 10000n;
      const sellerAmount = AMOUNT - fee;
      await expect(ctx.escrow.connect(ctx.other).releaseUnconfirmed(ctx.id))
        .to.emit(ctx.escrow, "Released")
        .withArgs(ctx.id, sellerAmount, fee, Reason.ConfirmTimeout, ZERO_HASH);
    });
  });

  describe("splitStale", function () {
    it("revert sebelum disputeWindow lewat", async function () {
      const ctx = await disputedFixture();
      await expect(ctx.escrow.splitStale(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "WindowStillOpen");
    });

    it("split 50/50 setelah disputeWindow lewat dari status Disputed", async function () {
      const ctx = await disputedFixture();
      await time.increase(DISPUTE_WINDOW + 1);
      const buyerAmount = AMOUNT / 2n;
      const sellerAmount = AMOUNT - buyerAmount;
      await expect(ctx.escrow.connect(ctx.other).splitStale(ctx.id))
        .to.emit(ctx.escrow, "SplitSettled")
        .withArgs(ctx.id, buyerAmount, sellerAmount);
      expect(await ctx.token.balanceOf(ctx.buyer.address)).to.be.gte(buyerAmount);
      expect((await ctx.escrow.getDeal(ctx.id)).status).to.equal(Status.Split);
    });

    it("split juga berlaku dari status Escalated", async function () {
      const ctx = await escalatedFixture();
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(ctx.escrow.splitStale(ctx.id)).to.emit(ctx.escrow, "SplitSettled");
    });

    it("split ganjil: amount 1 -> pembeli 0, penjual 1 (tanpa fee)", async function () {
      const ctx = await deployFixture();
      const { terms, offerSig, id } = await makeOffer(ctx, { amount: 1n });
      await ctx.escrow.connect(ctx.buyer).fund(terms, offerSig);
      await ctx.escrow.connect(ctx.seller).ship(id, SHIPMENT_HASH);
      await ctx.escrow.connect(ctx.buyer).dispute(id, DISPUTE_HASH);
      await time.increase(DISPUTE_WINDOW + 1);
      const sellerBefore = await ctx.token.balanceOf(ctx.seller.address);
      await expect(ctx.escrow.splitStale(id)).to.emit(ctx.escrow, "SplitSettled").withArgs(id, 0n, 1n);
      expect(await ctx.token.balanceOf(ctx.seller.address)).to.equal(sellerBefore + 1n);
      expect(await ctx.token.balanceOf(ctx.feeRecipient.address)).to.equal(0n);
    });

    it("revert kalau status bukan Disputed/Escalated", async function () {
      const ctx = await shippedFixture();
      await expect(ctx.escrow.splitStale(ctx.id)).to.be.revertedWithCustomError(ctx.escrow, "InvalidState");
    });
  });

  // ───────────────────────── invariants tambahan ─────────────────────────
  describe("invarian dana", function () {
    it("dana yang keluar hanya ke buyer/seller/feeRecipient — total token keluar = amount", async function () {
      const ctx = await disputedFixture();
      const escrowAddr = await ctx.escrow.getAddress();
      expect(await ctx.token.balanceOf(escrowAddr)).to.equal(AMOUNT);
      await ctx.escrow.connect(ctx.aiArbiter).resolve(ctx.id, false, VERDICT_HASH);
      expect(await ctx.token.balanceOf(escrowAddr)).to.equal(0n);
      const fee = (AMOUNT * BigInt(FEE_BPS)) / 10000n;
      expect(await ctx.token.balanceOf(ctx.seller.address)).to.equal(AMOUNT - fee);
      expect(await ctx.token.balanceOf(ctx.feeRecipient.address)).to.equal(fee);
    });
  });
});
