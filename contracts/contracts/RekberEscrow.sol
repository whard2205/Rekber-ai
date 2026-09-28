// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title RekberEscrow — rekber tanpa admin: uang dipegang kontrak, sengketa diputus AI
/// @notice Aturan dana: keluar HANYA ke pembeli, penjual, atau feeRecipient (fee hanya saat
///         Released). Tidak ada fungsi admin yang bisa memindahkan dana ke pihak lain.
///         Setiap status non-final (Funded/Shipped/Disputed/Escalated) punya jalan keluar
///         berbasis waktu yang bisa dipanggil siapa pun — dana tidak pernah nyangkut selamanya
///         walau operator (relayer/arbiter) hilang.
/// @dev Semua aksi pengguna (fund/ship/confirm/dispute) bisa ditandatangani EIP-712 dan
///      di-relay oleh siapa pun (gasless untuk buyer/seller) TANPA peran "relayer" khusus —
///      relayer cuma membayar gas, tidak bisa mengubah isi transaksi karena semua field
///      ikut ditandatangani. Lihat docs/rekber-ai/PLAN.md §3.2 untuk spesifikasi lengkap.
contract RekberEscrow is ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Funded,
        Shipped,
        Disputed,
        Escalated,
        Released,
        Refunded,
        Split
    }

    enum Action {
        Ship,
        Confirm,
        Dispute
    }

    enum SettleReason {
        BuyerConfirmed,
        ConfirmTimeout,
        ShipTimeout,
        AiVerdict,
        HumanVerdict
    }

    struct Deal {
        address buyer;
        address seller;
        uint256 amount;
        uint40 fundedAt;
        uint40 shippedAt;
        uint40 disputedAt;
        Status status;
        bytes32 specHash;
        bytes32 shipmentHash;
        bytes32 disputeHash;
        bytes32 verdictHash;
    }

    /// @notice Field-field penawaran yang ditandatangani penjual (Offer) — dipakai juga sebagai
    ///         parameter fund()/fundWithSig() supaya jumlah argumen kecil (hindari stack too deep).
    struct Terms {
        bytes32 dealId;
        address seller;
        uint256 amount;
        bytes32 specHash;
        uint256 offerDeadline;
    }

    error DealExists();
    error ZeroAmount();
    error ZeroAddress();
    error ZeroHash();
    error SelfDeal();
    error InvalidState();
    error NotBuyer();
    error NotSeller();
    error NotArbiter();
    error BadSignature();
    error SignatureExpired();
    error WindowClosed();
    error WindowStillOpen();
    error FeeTooHigh();

    event Funded(bytes32 indexed dealId, address indexed buyer, address indexed seller, uint256 amount, bytes32 specHash);
    event Shipped(bytes32 indexed dealId, bytes32 shipmentHash);
    event Disputed(bytes32 indexed dealId, bytes32 disputeHash);
    event Escalated(bytes32 indexed dealId, bytes32 verdictHash);
    event Released(bytes32 indexed dealId, uint256 sellerAmount, uint256 fee, SettleReason reason, bytes32 verdictHash);
    event Refunded(bytes32 indexed dealId, uint256 amount, SettleReason reason, bytes32 verdictHash);
    event SplitSettled(bytes32 indexed dealId, uint256 buyerAmount, uint256 sellerAmount);

    bytes32 private constant OFFER_TYPEHASH =
        keccak256("Offer(bytes32 dealId,address seller,uint256 amount,bytes32 specHash,uint256 deadline)");
    bytes32 private constant FUND_TYPEHASH =
        keccak256("Fund(bytes32 dealId,address buyer,address seller,uint256 amount,bytes32 specHash,uint256 deadline)");
    bytes32 private constant ACT_TYPEHASH =
        keccak256("Act(bytes32 dealId,uint8 action,bytes32 data,uint256 deadline)");

    IERC20 public immutable token;
    /// @notice Agent AI yang boleh resolve()/escalate() saat Disputed.
    address public immutable aiArbiter;
    /// @notice Arbiter manusia — boleh resolve() saat Disputed ATAU Escalated (jalur banding).
    address public immutable humanArbiter;
    address public immutable feeRecipient;
    /// @notice Fee dalam basis point, maks 500 (5%). Hanya dipungut saat dana cair ke penjual.
    uint16 public immutable feeBps;
    /// @notice Batas waktu penjual mengirim barang sejak Funded.
    uint40 public immutable shipWindow;
    /// @notice Batas waktu pembeli konfirmasi/komplain sejak Shipped.
    uint40 public immutable confirmWindow;
    /// @notice Batas waktu sengketa diputus (AI/manusia) sejak Disputed, sebelum split 50/50.
    uint40 public immutable disputeWindow;

    mapping(bytes32 => Deal) private _deals;

    constructor(
        IERC20 token_,
        address aiArbiter_,
        address humanArbiter_,
        address feeRecipient_,
        uint16 feeBps_,
        uint40 shipWindow_,
        uint40 confirmWindow_,
        uint40 disputeWindow_
    ) EIP712("RekberEscrow", "1") {
        if (
            address(token_) == address(0) ||
            aiArbiter_ == address(0) ||
            humanArbiter_ == address(0) ||
            feeRecipient_ == address(0)
        ) revert ZeroAddress();
        if (feeBps_ > 500) revert FeeTooHigh();

        token = token_;
        aiArbiter = aiArbiter_;
        humanArbiter = humanArbiter_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
        shipWindow = shipWindow_;
        confirmWindow = confirmWindow_;
        disputeWindow = disputeWindow_;
    }

    function getDeal(bytes32 dealId) external view returns (Deal memory) {
        return _deals[dealId];
    }

    // ───────────────────────────── fund ─────────────────────────────

    /// @notice Pembeli mendanai deal langsung (butuh approve() dulu). offerSig = Offer penjual.
    function fund(Terms calldata t, bytes calldata offerSig) external nonReentrant {
        _fund(t, msg.sender, offerSig);
    }

    /// @notice Relayer mengirim tx atas nama pembeli. fundSig = tanda tangan pembeli atas Fund
    ///         (mengikat buyer+seller+amount+specHash, jadi relayer tidak bisa mengubahnya).
    ///         permitSig kosong = pembeli sudah approve() manual (jalur token tanpa permit,
    ///         mis. IDRX asli). permitSig 65 byte = dicoba lewat try/catch (tahan front-run).
    function fundWithSig(
        Terms calldata t,
        address buyer,
        uint256 fundDeadline,
        bytes calldata offerSig,
        bytes calldata fundSig,
        uint256 permitDeadline,
        bytes calldata permitSig
    ) external nonReentrant {
        if (block.timestamp > fundDeadline) revert SignatureExpired();

        bytes32 fundDigest = _hashTypedDataV4(
            keccak256(abi.encode(FUND_TYPEHASH, t.dealId, buyer, t.seller, t.amount, t.specHash, fundDeadline))
        );
        if (ECDSA.recover(fundDigest, fundSig) != buyer) revert BadSignature();

        if (permitSig.length == 65) {
            (uint8 v, bytes32 r, bytes32 s) = _splitSig(permitSig);
            // Front-run tolerant: kalau allowance sudah di-set (mis. orang lain sudah submit
            // permit yang sama), permit() akan revert karena nonce sudah dipakai — abaikan,
            // lanjut fund selama allowance-nya memang cukup.
            try IERC20Permit(address(token)).permit(buyer, address(this), t.amount, permitDeadline, v, r, s) {} catch {}
        }

        _fund(t, buyer, offerSig);
    }

    function _fund(Terms calldata t, address buyer, bytes calldata offerSig) internal {
        if (_deals[t.dealId].status != Status.None) revert DealExists();
        if (t.amount == 0) revert ZeroAmount();
        if (t.seller == address(0)) revert ZeroAddress();
        if (t.seller == buyer) revert SelfDeal();
        if (block.timestamp > t.offerDeadline) revert SignatureExpired();

        bytes32 offerDigest = _hashTypedDataV4(
            keccak256(abi.encode(OFFER_TYPEHASH, t.dealId, t.seller, t.amount, t.specHash, t.offerDeadline))
        );
        if (ECDSA.recover(offerDigest, offerSig) != t.seller) revert BadSignature();

        Deal storage d = _deals[t.dealId];
        d.buyer = buyer;
        d.seller = t.seller;
        d.amount = t.amount;
        d.specHash = t.specHash;
        d.fundedAt = uint40(block.timestamp);
        d.status = Status.Funded;

        token.safeTransferFrom(buyer, address(this), t.amount);
        emit Funded(t.dealId, buyer, t.seller, t.amount, t.specHash);
    }

    // ───────────────────────────── ship / confirm / dispute ─────────────────────────────

    function ship(bytes32 dealId, bytes32 shipmentHash) external {
        _ship(dealId, shipmentHash, msg.sender);
    }

    function confirm(bytes32 dealId) external nonReentrant {
        _confirm(dealId, msg.sender);
    }

    function dispute(bytes32 dealId, bytes32 disputeHash) external {
        _dispute(dealId, disputeHash, msg.sender);
    }

    /// @notice Jalur relay untuk ship/confirm/dispute. Penanda tangan yang di-recover dari `sig`
    ///         diperlakukan persis seperti msg.sender di fungsi langsung — kalau bukan pihak
    ///         yang berhak (penjual untuk Ship, pembeli untuk Confirm/Dispute), revert
    ///         NotSeller/NotBuyer (bukan BadSignature — pesannya lebih jelas: sah tapi bukan dia).
    function act(bytes32 dealId, Action action, bytes32 data, uint256 deadline, bytes calldata sig) external nonReentrant {
        if (block.timestamp > deadline) revert SignatureExpired();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ACT_TYPEHASH, dealId, uint8(action), data, deadline)));
        address signer = ECDSA.recover(digest, sig);

        if (action == Action.Ship) {
            _ship(dealId, data, signer);
        } else if (action == Action.Confirm) {
            _confirm(dealId, signer);
        } else {
            _dispute(dealId, data, signer);
        }
    }

    function _ship(bytes32 dealId, bytes32 shipmentHash, address caller) internal {
        Deal storage d = _deals[dealId];
        // Status dicek dulu, baru otorisasi — deal yang tidak ada (status None) selalu
        // InvalidState, bukan NotSeller/NotBuyer yang menyesatkan (seolah caller-nya salah).
        if (d.status != Status.Funded) revert InvalidState();
        if (caller != d.seller) revert NotSeller();
        if (block.timestamp > uint256(d.fundedAt) + shipWindow) revert WindowClosed();
        if (shipmentHash == bytes32(0)) revert ZeroHash();

        d.shipmentHash = shipmentHash;
        d.shippedAt = uint40(block.timestamp);
        d.status = Status.Shipped;
        emit Shipped(dealId, shipmentHash);
    }

    function _confirm(bytes32 dealId, address caller) internal {
        Deal storage d = _deals[dealId];
        if (d.status != Status.Shipped) revert InvalidState();
        if (caller != d.buyer) revert NotBuyer();
        _settleRelease(dealId, d, SettleReason.BuyerConfirmed, bytes32(0));
    }

    function _dispute(bytes32 dealId, bytes32 disputeHash, address caller) internal {
        Deal storage d = _deals[dealId];
        if (d.status != Status.Shipped) revert InvalidState();
        if (caller != d.buyer) revert NotBuyer();
        if (block.timestamp > uint256(d.shippedAt) + confirmWindow) revert WindowClosed();
        if (disputeHash == bytes32(0)) revert ZeroHash();

        d.disputeHash = disputeHash;
        d.disputedAt = uint40(block.timestamp);
        d.status = Status.Disputed;
        emit Disputed(dealId, disputeHash);
    }

    // ───────────────────────────── arbiter ─────────────────────────────

    /// @notice aiArbiter memutus saat Disputed; humanArbiter memutus saat Disputed ATAU
    ///         Escalated (jalur banding). aiArbiter TIDAK BISA memutus kasus yang sudah
    ///         di-escalate — itu murni wewenang manusia.
    function resolve(bytes32 dealId, bool refundBuyer, bytes32 verdictHash) external nonReentrant {
        Deal storage d = _deals[dealId];
        SettleReason reason;
        if (msg.sender == aiArbiter) {
            if (d.status != Status.Disputed) revert InvalidState();
            reason = SettleReason.AiVerdict;
        } else if (msg.sender == humanArbiter) {
            if (d.status != Status.Disputed && d.status != Status.Escalated) revert InvalidState();
            reason = SettleReason.HumanVerdict;
        } else {
            revert NotArbiter();
        }
        if (verdictHash == bytes32(0)) revert ZeroHash();

        if (refundBuyer) {
            _settleRefund(dealId, d, reason, verdictHash);
        } else {
            _settleRelease(dealId, d, reason, verdictHash);
        }
    }

    /// @notice aiArbiter melempar kasus ke manusia saat ragu (confidence rendah / output rusak).
    function escalate(bytes32 dealId, bytes32 verdictHash) external {
        Deal storage d = _deals[dealId];
        if (msg.sender != aiArbiter) revert NotArbiter();
        if (d.status != Status.Disputed) revert InvalidState();
        if (verdictHash == bytes32(0)) revert ZeroHash();

        d.verdictHash = verdictHash;
        d.status = Status.Escalated;
        emit Escalated(dealId, verdictHash);
    }

    // ───────────────────────────── jalan keluar berbasis waktu ─────────────────────────────

    /// @notice Penjual tidak kirim sampai shipWindow lewat -> siapa pun bisa refund pembeli.
    function refundUnshipped(bytes32 dealId) external nonReentrant {
        Deal storage d = _deals[dealId];
        if (d.status != Status.Funded) revert InvalidState();
        if (block.timestamp <= uint256(d.fundedAt) + shipWindow) revert WindowStillOpen();
        _settleRefund(dealId, d, SettleReason.ShipTimeout, bytes32(0));
    }

    /// @notice Pembeli diam sampai confirmWindow lewat -> siapa pun bisa cairkan ke penjual.
    function releaseUnconfirmed(bytes32 dealId) external nonReentrant {
        Deal storage d = _deals[dealId];
        if (d.status != Status.Shipped) revert InvalidState();
        if (block.timestamp <= uint256(d.shippedAt) + confirmWindow) revert WindowStillOpen();
        _settleRelease(dealId, d, SettleReason.ConfirmTimeout, bytes32(0));
    }

    /// @notice Sengketa tak kunjung diputus sampai disputeWindow lewat -> split 50/50, tanpa fee.
    ///         Jaminan terakhir kalau operator (agent + arbiter manusia) hilang bersamaan.
    function splitStale(bytes32 dealId) external nonReentrant {
        Deal storage d = _deals[dealId];
        if (d.status != Status.Disputed && d.status != Status.Escalated) revert InvalidState();
        if (block.timestamp <= uint256(d.disputedAt) + disputeWindow) revert WindowStillOpen();
        _settleSplit(dealId, d);
    }

    // ───────────────────────────── settlement ─────────────────────────────

    function _settleRelease(bytes32 dealId, Deal storage d, SettleReason reason, bytes32 verdictHash) internal {
        d.status = Status.Released;
        d.verdictHash = verdictHash;
        uint256 fee = (d.amount * feeBps) / 10000;
        uint256 sellerAmount = d.amount - fee;
        token.safeTransfer(d.seller, sellerAmount);
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        emit Released(dealId, sellerAmount, fee, reason, verdictHash);
    }

    function _settleRefund(bytes32 dealId, Deal storage d, SettleReason reason, bytes32 verdictHash) internal {
        d.status = Status.Refunded;
        d.verdictHash = verdictHash;
        token.safeTransfer(d.buyer, d.amount);
        emit Refunded(dealId, d.amount, reason, verdictHash);
    }

    function _settleSplit(bytes32 dealId, Deal storage d) internal {
        d.status = Status.Split;
        uint256 buyerAmount = d.amount / 2;
        uint256 sellerAmount = d.amount - buyerAmount;
        if (buyerAmount > 0) token.safeTransfer(d.buyer, buyerAmount);
        token.safeTransfer(d.seller, sellerAmount);
        emit SplitSettled(dealId, buyerAmount, sellerAmount);
    }

    function _splitSig(bytes calldata sig) internal pure returns (uint8 v, bytes32 r, bytes32 s) {
        // sig.length == 65 sudah dicek pemanggil.
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
    }
}
