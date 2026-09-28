// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Test stand-in for IDRX (Rupiah stablecoin). Anyone can mint on testnet.
/// @dev 0 desimal, sama seperti IDRX asli di BNB Chain (dicek langsung on-chain,
///      lihat docs/rekber-ai/BLUEPRINT.md §14 [13]) — 1 unit token = Rp1.
///      permit() HANYA ada di sini untuk demo tanpa gas. IDRX asli di BSC TIDAK
///      mendukung EIP-2612 — jalur produksi memakai gas sponsorship
///      (MegaFuel paymaster / EIP-7702), bukan permit. Lihat BLUEPRINT §8 (1c).
contract MockIDRX is ERC20, ERC20Permit {
    constructor() ERC20("Mock IDRX", "IDRX") ERC20Permit("Mock IDRX") {}

    function decimals() public pure override returns (uint8) {
        return 0;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
