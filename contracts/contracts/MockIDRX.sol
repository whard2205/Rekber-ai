// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test stand-in for IDRX (Rupiah stablecoin). Anyone can mint on testnet.
contract MockIDRX is ERC20 {
    constructor() ERC20("Mock IDRX", "IDRX") {}

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
