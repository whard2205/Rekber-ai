// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TaskEscrow — escrow upah untuk task yang diposting AI agent ke pekerja manusia
/// @notice Aturan dana: keluar HANYA ke worker (release/forceRelease) atau kembali ke
///         agent via refundExpired selama belum ada proof. Setelah proof tersubmit,
///         agent hanya punya dua pilihan: bayar, atau reopen — tidak pernah bisa menarik dana.
///         Kalau agent diam melewati verifyWindow, siapa pun bisa memicu forceRelease
///         dan worker tetap dibayar.
contract TaskEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open,
        Claimed,
        Submitted,
        Paid,
        Refunded
    }

    struct Task {
        address agent;
        address token;
        uint96 bounty;
        bytes32 specHash;
        address worker;
        bytes32 proofHash;
        uint40 deadline;
        uint40 submittedAt;
        Status status;
    }

    error InvalidState();
    error NotAgent();
    error NotWorker();
    error NotRelayer();
    error ZeroBounty();
    error BadDeadline();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error VerifyWindowActive();

    event TaskPosted(
        uint256 indexed taskId,
        address indexed agent,
        address token,
        uint96 bounty,
        bytes32 specHash,
        uint40 deadline
    );
    event TaskClaimed(uint256 indexed taskId, address indexed worker);
    event ProofSubmitted(uint256 indexed taskId, address indexed worker, bytes32 proofHash);
    event BountyReleased(uint256 indexed taskId, address indexed worker, uint256 amount);
    event TaskReopened(uint256 indexed taskId);
    event TaskRefunded(uint256 indexed taskId);

    /// @notice Backend yang boleh claim/submit atas nama worker (worker tanpa gas).
    address public immutable relayer;
    /// @notice Jeda maksimal agent memverifikasi proof sebelum worker boleh forceRelease.
    uint40 public immutable verifyWindow;

    uint256 public nextTaskId;
    mapping(uint256 => Task) private _tasks;

    constructor(address relayer_, uint40 verifyWindow_) {
        relayer = relayer_;
        verifyWindow = verifyWindow_;
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _tasks[taskId];
    }

    function postTask(
        address token,
        uint96 bounty,
        bytes32 specHash,
        uint40 deadline
    ) external returns (uint256 taskId) {
        if (bounty == 0) revert ZeroBounty();
        if (deadline <= block.timestamp) revert BadDeadline();

        taskId = nextTaskId++;
        _tasks[taskId] = Task({
            agent: msg.sender,
            token: token,
            bounty: bounty,
            specHash: specHash,
            worker: address(0),
            proofHash: bytes32(0),
            deadline: deadline,
            submittedAt: 0,
            status: Status.Open
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), bounty);
        emit TaskPosted(taskId, msg.sender, token, bounty, specHash, deadline);
    }

    function claimTask(uint256 taskId) external {
        _claim(taskId, msg.sender);
    }

    function claimFor(uint256 taskId, address worker) external onlyRelayer {
        _claim(taskId, worker);
    }

    function submitProof(uint256 taskId, bytes32 proofHash) external {
        _submit(taskId, msg.sender, proofHash);
    }

    function submitProofFor(uint256 taskId, address worker, bytes32 proofHash) external onlyRelayer {
        _submit(taskId, worker, proofHash);
    }

    /// @notice Hanya agent pemilik task; satu-satunya jalur pembayaran normal.
    function releaseBounty(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Submitted) revert InvalidState();
        if (msg.sender != t.agent) revert NotAgent();
        _pay(taskId, t);
    }

    /// @notice Agent menolak proof: task kembali Open untuk worker lain. Dana tetap terkunci.
    function rejectAndReopen(uint256 taskId) external {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Submitted) revert InvalidState();
        if (msg.sender != t.agent) revert NotAgent();

        t.worker = address(0);
        t.proofHash = bytes32(0);
        t.submittedAt = 0;
        t.status = Status.Open;
        emit TaskReopened(taskId);
    }

    /// @notice Setelah deadline tanpa proof, siapa pun boleh mengembalikan dana ke agent.
    function refundExpired(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Open && t.status != Status.Claimed) revert InvalidState();
        if (block.timestamp <= t.deadline) revert DeadlineNotPassed();

        t.status = Status.Refunded;
        IERC20(t.token).safeTransfer(t.agent, t.bounty);
        emit TaskRefunded(taskId);
    }

    /// @notice Perlindungan worker: agent diam melewati verifyWindow = worker tetap dibayar.
    function forceRelease(uint256 taskId) external nonReentrant {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Submitted) revert InvalidState();
        if (block.timestamp <= uint256(t.submittedAt) + verifyWindow) revert VerifyWindowActive();
        _pay(taskId, t);
    }

    function _claim(uint256 taskId, address worker) internal {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Open) revert InvalidState();
        if (block.timestamp > t.deadline) revert DeadlinePassed();

        t.worker = worker;
        t.status = Status.Claimed;
        emit TaskClaimed(taskId, worker);
    }

    function _submit(uint256 taskId, address worker, bytes32 proofHash) internal {
        Task storage t = _tasks[taskId];
        if (t.status != Status.Claimed) revert InvalidState();
        if (t.worker != worker) revert NotWorker();

        t.proofHash = proofHash;
        t.submittedAt = uint40(block.timestamp);
        t.status = Status.Submitted;
        emit ProofSubmitted(taskId, worker, proofHash);
    }

    function _pay(uint256 taskId, Task storage t) internal {
        t.status = Status.Paid;
        IERC20(t.token).safeTransfer(t.worker, t.bounty);
        emit BountyReleased(taskId, t.worker, t.bounty);
    }
}
