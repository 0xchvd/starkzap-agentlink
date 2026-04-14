import { connect, disconnect } from "@starknet-io/get-starknet";
import {
  StarkZap,
  TransactionFinalityStatus,
  type Call,
} from "starkzap";
import { cairo, num, WalletAccount, Contract } from "starknet";
import abi from "../abi.json";

// --- Starkzap SDK initialization ---
const sdk = new StarkZap({ network: "sepolia" });
const provider = sdk.getProvider();

// --- Constants ---
const ESCROW_ADDRESS = "0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb";
const STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const VOYAGER_BASE = "https://sepolia.voyager.online";

// --- State ---
let walletAccount: any = null;
let escrowContract: Contract | null = null;

// --- DOM refs ---
const $connectBtn = document.getElementById("btn-connect") as HTMLButtonElement;
const $walletStatus = document.getElementById("wallet-status")!;
const $walletAddr = document.getElementById("wallet-addr")!;
const $walletBalance = document.getElementById("wallet-balance")!;
const $sectionCreate = document.getElementById("section-create")!;
const $sectionLookup = document.getElementById("section-lookup")!;
const $sectionLog = document.getElementById("section-log")!;
const $formCreate = document.getElementById("form-create") as HTMLFormElement;
const $createResult = document.getElementById("create-result")!;
const $btnCreate = document.getElementById("btn-create") as HTMLButtonElement;
const $inpLinkId = document.getElementById("inp-linkid") as HTMLInputElement;
const $btnLookup = document.getElementById("btn-lookup") as HTMLButtonElement;
const $lookupResult = document.getElementById("lookup-result")!;
const $lookupError = document.getElementById("lookup-error")!;
const $linkInfo = document.getElementById("link-info")!;
const $btnRevoke = document.getElementById("btn-revoke") as HTMLButtonElement;
const $txLog = document.getElementById("tx-log")!;

// --- ERC20 ABI (just what we need) ---
const erc20Abi = [
  {
    type: "function",
    name: "balance_of",
    inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "core::starknet::contract_address::ContractAddress" },
      { name: "amount", type: "core::integer::u256" },
    ],
    outputs: [{ type: "core::bool" }],
    state_mutability: "external",
  },
];

// --- Helpers ---
function show(el: HTMLElement) { el.classList.remove("hidden"); }
function hide(el: HTMLElement) { el.classList.add("hidden"); }

function truncAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

function formatStrk(weiStr: string | bigint): string {
  const wei = BigInt(weiStr);
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
  return `${whole}.${fracStr} STRK`;
}

function logTx(type: string, txHash: string) {
  show($sectionLog);
  const entry = document.createElement("div");
  entry.className = "tx-entry";
  entry.innerHTML = `
    <span class="tx-type">${type}</span>
    <a href="${VOYAGER_BASE}/tx/${txHash}" target="_blank">${truncAddr(txHash)}</a>
  `;
  $txLog.prepend(entry);
}

// --- Read contract state via Starkzap SDK ---
async function readBalance(address: string): Promise<bigint> {
  const strkContract = new Contract(erc20Abi, STRK_TOKEN, provider);
  const bal = await strkContract.balance_of(address);
  return BigInt(bal);
}

async function readLinkRules(linkId: number) {
  const readContract = new Contract(abi, ESCROW_ADDRESS, provider);
  const rules = await readContract.get_rules(linkId);
  const remaining = await readContract.remaining(linkId);
  return { rules, remaining };
}

// --- Wallet connection (browser wallet via get-starknet) ---
$connectBtn.addEventListener("click", async () => {
  if (walletAccount) {
    await disconnect();
    walletAccount = null;
    escrowContract = null;
    $connectBtn.textContent = "Connect Wallet";
    hide($walletStatus);
    hide($sectionCreate);
    hide($sectionLookup);
    hide($sectionLog);
    return;
  }

  try {
    const swo = await connect({ modalMode: "alwaysAsk" });
    if (!swo) return;

    // get-starknet v4: construct a WalletAccount from the wallet object
    walletAccount = await WalletAccount.connect(provider, swo);

    if (!walletAccount || !walletAccount.address) {
      throw new Error("Wallet returned no account. Approve the connection in the extension.");
    }

    escrowContract = new Contract(abi, ESCROW_ADDRESS, walletAccount);

    const addr = walletAccount.address;
    $walletAddr.textContent = truncAddr(addr);
    $connectBtn.textContent = "Disconnect";

    // Fetch STRK balance via Starkzap provider
    const bal = await readBalance(addr);
    $walletBalance.textContent = formatStrk(bal);

    show($walletStatus);
    show($sectionCreate);
    show($sectionLookup);
  } catch (err: any) {
    console.error("Connection failed:", err);
    alert("Wallet connection failed: " + (err?.message || err) + "\n\nOpen DevTools console for details.");
  }
});

// --- Create Link ---
$formCreate.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!walletAccount || !escrowContract) return;

  const fundingStrk = parseFloat((document.getElementById("inp-funding") as HTMLInputElement).value);
  const perTxStrk = parseFloat((document.getElementById("inp-pertx") as HTMLInputElement).value);
  const expirySeconds = parseInt((document.getElementById("inp-expiry") as HTMLSelectElement).value);
  const contractsRaw = (document.getElementById("inp-contracts") as HTMLTextAreaElement).value.trim();
  const destsRaw = (document.getElementById("inp-destinations") as HTMLTextAreaElement).value.trim();

  if (perTxStrk > fundingStrk) {
    $createResult.textContent = "Per-tx cap cannot exceed total funding.";
    $createResult.className = "result error";
    show($createResult);
    return;
  }

  const fundingWei = BigInt(Math.floor(fundingStrk * 1e18));
  const perTxWei = BigInt(Math.floor(perTxStrk * 1e18));

  // Generate a random session pubkey (for demo — in production this would be a real keypair)
  const sessionPubkey = "0x" + Array.from(crypto.getRandomValues(new Uint8Array(31)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const now = Math.floor(Date.now() / 1000);
  const validUntil = now + expirySeconds;

  const allowedContracts = contractsRaw ? contractsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [STRK_TOKEN];
  const allowedDests = destsRaw ? destsRaw.split("\n").map(s => s.trim()).filter(Boolean) : [walletAccount.address];

  // Build allowed_selectors: for each contract, allow "transfer" selector
  const transferSelector = "0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e"; // selector!("transfer")

  $btnCreate.disabled = true;
  $btnCreate.innerHTML = '<span class="spinner"></span>Creating...';
  hide($createResult);

  try {
    // Step 1: Approve escrow to pull funding tokens (Starkzap Call type)
    const strkContract = new Contract(erc20Abi, STRK_TOKEN, walletAccount);
    const approveCall: Call = strkContract.populate("approve", [ESCROW_ADDRESS, cairo.uint256(fundingWei)]);

    // Step 2: Build create_link call with raw calldata
    // Tuple Array<(ContractAddress, felt252)> serialized as: [len, addr1, sel1, ...]
    const createCall: Call = {
      contractAddress: ESCROW_ADDRESS,
      entrypoint: "create_link",
      calldata: [
        sessionPubkey,                                            // session_pubkey
        STRK_TOKEN,                                               // funding_token
        "0x" + fundingWei.toString(16), "0x0",                    // total_cap (u256: low, high)
        "0x" + perTxWei.toString(16), "0x0",                      // per_tx_cap (u256: low, high)
        "0x" + validUntil.toString(16),                            // valid_until
        "0x" + allowedContracts.length.toString(16),               // allowed_contracts array len
        ...allowedContracts,                                       // allowed_contracts items
        "0x" + allowedContracts.length.toString(16),               // allowed_selectors array len
        ...allowedContracts.flatMap(c => [c, transferSelector]),   // (addr, selector) tuples
        "0x" + allowedDests.length.toString(16),                   // allowed_destinations array len
        ...allowedDests,                                           // allowed_destinations items
        "0x" + fundingWei.toString(16), "0x0",                     // funding (u256: low, high)
      ],
    };

    // Atomic multicall: approve + create_link
    const { transaction_hash } = await walletAccount.execute([approveCall, createCall]);

    // Wait for L2 confirmation via Starkzap provider
    await provider.waitForTransaction(transaction_hash, {
      successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
    });
    logTx("Create Link", transaction_hash);

    $createResult.innerHTML = `
      <strong>Link created!</strong><br/>
      TX: <a href="${VOYAGER_BASE}/tx/${transaction_hash}" target="_blank" style="color:var(--accent)">${truncAddr(transaction_hash)}</a><br/>
      Session Pubkey: ${truncAddr(sessionPubkey)}<br/>
      Funding: ${formatStrk(fundingWei)} | Per-tx cap: ${formatStrk(perTxWei)}<br/>
      Expires: ${new Date(validUntil * 1000).toLocaleString()}<br/><br/>
      <em>Check the Link Dashboard below to see the link details.</em>
    `;
    $createResult.className = "result success";
    show($createResult);

    // Refresh balance via Starkzap provider
    const newBal = await readBalance(walletAccount.address);
    $walletBalance.textContent = formatStrk(newBal);
  } catch (err: any) {
    console.error("Create link failed:", err);
    $createResult.textContent = `Error: ${err.message || err}`;
    $createResult.className = "result error";
    show($createResult);
  } finally {
    $btnCreate.disabled = false;
    $btnCreate.textContent = "Create Link";
  }
});

// --- Lookup Link (read-only via Starkzap SDK) ---
$btnLookup.addEventListener("click", async () => {
  const linkId = parseInt($inpLinkId.value);
  if (!linkId || linkId < 1) return;

  $btnLookup.disabled = true;
  $btnLookup.innerHTML = '<span class="spinner"></span>';
  hide($lookupResult);
  hide($lookupError);

  try {
    const { rules, remaining } = await readLinkRules(linkId);

    const sender = num.toHex(rules.sender);
    const totalCap = BigInt(rules.total_cap);
    const perTxCap = BigInt(rules.per_tx_cap);
    const validUntil = Number(rules.valid_until);
    const revoked = rules.revoked;
    const sessionPubkey = num.toHex(rules.session_pubkey);
    const remainingWei = BigInt(remaining);

    // Check if link exists (session_pubkey == 0 means no link)
    if (sessionPubkey === "0x0") {
      $lookupError.textContent = `Link #${linkId} does not exist.`;
      $lookupError.className = "result error";
      show($lookupError);
      hide($lookupResult);
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const isExpired = validUntil <= now;
    const isRevoked = revoked === true || revoked === 1 || (revoked as any)?.variant?.True !== undefined;
    let statusClass = "active";
    let statusText = "Active";
    if (isRevoked) { statusClass = "revoked"; statusText = "Revoked"; }
    else if (isExpired) { statusClass = "expired"; statusText = "Expired"; }

    const spent = totalCap - remainingWei;
    const pctUsed = totalCap > 0n ? Number((spent * 100n) / totalCap) : 0;

    $linkInfo.innerHTML = `
      <span class="label">Status</span>
      <span class="link-status"><span class="status-dot ${statusClass}"></span>${statusText}</span>
      <span class="label">Link ID</span>
      <span>${linkId}</span>
      <span class="label">Sender</span>
      <span class="mono">${truncAddr(sender)}</span>
      <span class="label">Session Key</span>
      <span class="mono">${truncAddr(sessionPubkey)}</span>
      <span class="label">Total Cap</span>
      <span>${formatStrk(totalCap)}</span>
      <span class="label">Per-TX Cap</span>
      <span>${formatStrk(perTxCap)}</span>
      <span class="label">Remaining</span>
      <span>${formatStrk(remainingWei)} (${pctUsed}% used)</span>
      <span class="label">Expires</span>
      <span>${new Date(validUntil * 1000).toLocaleString()}</span>
    `;

    // Show/hide revoke button
    if (walletAccount && !isRevoked) {
      $btnRevoke.classList.remove("hidden");
    } else {
      $btnRevoke.classList.add("hidden");
    }

    show($lookupResult);
  } catch (err: any) {
    console.error("Lookup failed:", err);
    $lookupError.textContent = `Error: ${err.message || err}`;
    $lookupError.className = "result error";
    show($lookupError);
  } finally {
    $btnLookup.disabled = false;
    $btnLookup.textContent = "Lookup";
  }
});

// --- Revoke ---
$btnRevoke.addEventListener("click", async () => {
  const linkId = parseInt($inpLinkId.value);
  if (!linkId || !walletAccount || !escrowContract) return;

  $btnRevoke.disabled = true;
  $btnRevoke.innerHTML = '<span class="spinner"></span>Revoking...';

  try {
    const revokeCall: Call = escrowContract.populate("revoke", [linkId]);
    const { transaction_hash } = await walletAccount.execute([revokeCall]);
    await provider.waitForTransaction(transaction_hash, {
      successStates: [TransactionFinalityStatus.ACCEPTED_ON_L2],
    });
    logTx("Revoke Link #" + linkId, transaction_hash);

    // Refresh the lookup
    $btnLookup.click();

    // Refresh balance via Starkzap provider
    const newBal = await readBalance(walletAccount.address);
    $walletBalance.textContent = formatStrk(newBal);
  } catch (err: any) {
    console.error("Revoke failed:", err);
    alert("Revoke failed: " + (err.message || err));
  } finally {
    $btnRevoke.disabled = false;
    $btnRevoke.textContent = "Revoke & Refund";
  }
});
