const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MockIDRX", function () {
  async function deployFixture() {
    const [deployer, owner, spender] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockIDRX")).deploy();
    return { token, deployer, owner, spender };
  }

  async function permitSig(token, owner, spender, value, deadline) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const nonce = await token.nonces(owner.address);
    const domain = {
      name: "Mock IDRX",
      version: "1",
      chainId,
      verifyingContract: await token.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    const value_ = { owner: owner.address, spender: spender.address, value, nonce, deadline };
    const sig = await owner.signTypedData(domain, types, value_);
    return ethers.Signature.from(sig);
  }

  it("nama, simbol, 0 desimal — sama seperti IDRX asli di BNB Chain", async function () {
    const { token } = await loadFixture(deployFixture);
    expect(await token.name()).to.equal("Mock IDRX");
    expect(await token.symbol()).to.equal("IDRX");
    expect(await token.decimals()).to.equal(0);
  });

  it("mint terbuka untuk siapa pun (khusus testnet)", async function () {
    const { token, owner } = await loadFixture(deployFixture);
    await token.mint(owner.address, 10_000_000n);
    expect(await token.balanceOf(owner.address)).to.equal(10_000_000n);
  });

  it("permit: tanda tangan owner men-set allowance tanpa tx dari owner", async function () {
    const { token, owner, spender } = await loadFixture(deployFixture);
    await token.mint(owner.address, 10_000_000n);
    const deadline = (await time.latest()) + 3600;
    const { v, r, s } = await permitSig(token, owner, spender, 8_500_000n, deadline);

    await token.connect(spender).permit(owner.address, spender.address, 8_500_000n, deadline, v, r, s);
    expect(await token.allowance(owner.address, spender.address)).to.equal(8_500_000n);
    expect(await token.nonces(owner.address)).to.equal(1n);
  });

  it("permit: revert kalau kedaluwarsa", async function () {
    const { token, owner, spender } = await loadFixture(deployFixture);
    const deadline = (await time.latest()) - 1;
    const { v, r, s } = await permitSig(token, owner, spender, 1n, deadline);
    await expect(
      token.connect(spender).permit(owner.address, spender.address, 1n, deadline, v, r, s),
    ).to.be.reverted;
  });

  it("permit: revert kalau tanda tangan bukan dari owner", async function () {
    const { token, owner, spender, deployer } = await loadFixture(deployFixture);
    const deadline = (await time.latest()) + 3600;
    // deployer menandatangani, tapi dipanggil seolah-olah owner adalah `owner`
    const chainId = (await ethers.provider.getNetwork()).chainId;
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
    const nonce = await token.nonces(owner.address);
    const sig = await deployer.signTypedData(domain, types, {
      owner: owner.address,
      spender: spender.address,
      value: 1n,
      nonce,
      deadline,
    });
    const { v, r, s } = ethers.Signature.from(sig);
    await expect(
      token.connect(spender).permit(owner.address, spender.address, 1n, deadline, v, r, s),
    ).to.be.reverted;
  });
});
