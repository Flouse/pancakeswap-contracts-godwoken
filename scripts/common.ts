import { ethers } from "ethers";
import { PolyjuiceConfig } from "@polyjuice-provider/base";
import {
  PolyjuiceWallet,
  PolyjuiceJsonRpcProvider,
} from "@polyjuice-provider/ethers";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import { HexString, Script, utils } from "@ckb-lumos/base";

dotenv.config({
  path: path.resolve(process.env.ENV_PATH ?? "./.env"),
});
axios.defaults.withCredentials = true;

const { DEPLOYER_PRIVATE_KEY, NETWORK_SUFFIX, GODWOKEN_API_URL } = process.env;
if (DEPLOYER_PRIVATE_KEY == null) {
  console.log("process.env.DEPLOYER_PRIVATE_KEY is required");
  process.exit(1);
}

export const polyjuiceConfig: PolyjuiceConfig = {
  rollupTypeHash: process.env.ROLLUP_TYPE_HASH!,
  ethAccountLockCodeHash: process.env.ETH_ACCOUNT_LOCK_CODE_HASH!,
  web3Url: process.env.RPC_URL,
};
export const polyjuiceRPC = new PolyjuiceJsonRpcProvider(
  polyjuiceConfig,
  process.env.RPC_URL,
);
export const polyjuiceDeployer = new PolyjuiceWallet(
  DEPLOYER_PRIVATE_KEY,
  polyjuiceConfig,
  polyjuiceRPC,
);

export const defaultRPC = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL,
);
export const defaultDeployer = new ethers.Wallet(
  DEPLOYER_PRIVATE_KEY,
  defaultRPC,
);

export const networkSuffix = NETWORK_SUFFIX;
export const isGodwokenDevnet = networkSuffix === "gw-devnet";

export async function initGWAccountIfNeeded(account: string, usingRPC = rpc) {
  const balance = await usingRPC.getBalance(account);
  if (balance.gt(0)) {
    return;
  }

  if (!isGodwoken) {
    console.log(`[warn] account(${account}) balance is 0`);
    return;
  }

  if (networkSuffix !== "gw-devnet") {
    throw new Error(
      `Please initialize godwoken account for ${account} by deposit first`,
    );
  }

  console.log(`Running: Initialize Godwoken account for ${account} by deposit`);

  if (GODWOKEN_API_URL == null) {
    throw new Error("process.env.GODWOKEN_API_URL is required");
  }

  console.log("    It may take a few minutes...");

  let res = await axios.get(`${GODWOKEN_API_URL}/deposit`, {
    params: {
      eth_address: account,
    },
  });

  if (res.data.status !== "ok") {
    console.log("    Failed to deposit, res:", res);
    throw new Error();
  }

  console.log(`    Initialized, id:`, res.data.data.account_id);
}

export function ethEoaAddressToGodwokenShortAddress(
  ethAddress: HexString,
): HexString {
  if (!isGodwoken) {
    return ethAddress;
  }

  if (!ethers.utils.isAddress(ethAddress)) {
    throw new Error("eth address format error!");
  }

  const layer2Lock: Script = {
    code_hash: polyjuiceConfig.ethAccountLockCodeHash!,
    hash_type: "type",
    args: polyjuiceConfig.rollupTypeHash + ethAddress.slice(2).toLowerCase(),
  };
  const scriptHash = utils.computeScriptHash(layer2Lock);
  const shortAddress = scriptHash.slice(0, 42);
  return shortAddress;
}

export function create2ContractAddressToGodwokenShortAddress(
  ethAddress: HexString,
): HexString {
  if (!isGodwoken) {
    return ethAddress;
  }

  if (!ethers.utils.isAddress(ethAddress)) {
    throw new Error("eth address format error!");
  }

  const creatorAccountId = Number(process.env.CREATOR_ACCOUNT_ID!);
  const creatorAccountIdLe = u32ToLittleEndian(creatorAccountId);

  const layer2Lock: Script = {
    code_hash: process.env.POLYJUICE_CONTRACT_CODE_HASH!,
    hash_type: "type",
    args:
      polyjuiceConfig.rollupTypeHash +
      creatorAccountIdLe.slice(2) +
      ethAddress.slice(2).toLowerCase(),
  };
  const scriptHash = utils.computeScriptHash(layer2Lock);
  const shortAddress = scriptHash.slice(0, 42);
  return ethers.utils.getAddress(shortAddress);
}

function u32ToLittleEndian(num: number): HexString {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(num);
  return `0x${buf.toString("hex")}`;
}

export function unit(n: number): ethers.BigNumber {
  return ethers.constants.WeiPerEther.mul(ethers.BigNumber.from(n * 1e6)).div(
    1e6,
  );
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

export async function retry<T>(fn: () => Promise<T>, retriesLeft = 3, interval = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(error);
    console.log("=".repeat(80));
    if (retriesLeft === 0) {
      throw new Error(`Max retries reached for function ${fn.name}`);
    }
    await sleep(interval);
    return await retry(fn, --retriesLeft, interval);
  }
}

export const promiseAllLimitN = async <T>(n: number, list: (() => Promise<T>)[]) => {
  const head = list.slice(0, n)
  const tail = list.slice(n)
  const result: T[] = []
  const execute = async (promise: () => Promise<T>, i: number, runNext: () => Promise<void>) => {
    result[i] = await promise()
    await runNext()
  }
  const runNext = async () => {
    const i = list.length - tail.length
    const promise = tail.shift()
    if (promise !== undefined) {
      await execute(promise, i, runNext)
    }
  }
  await Promise.all(head.map((promise, i) => execute(promise, i, runNext)))
  return result
}

// export const resolveOrTimeout = <T = unknown>(
//   // Promise or a function that will be passed to a Promise object
//   promiseOrHandler:
//     | Promise<T>
//     | ((
//       resolve: (data: T) => void,
//       reject?: (data: unknown) => void
//     ) => unknown),
//   // timeout in milliseconds. if 0, race condition will not apply and original promise will be returned as is
//   timeout: number,
//   // optional, timeout error message
//   timeoutError = `Async operation didn't complete in ${timeout}ms.`,
//   // optional callback that will be executed when timeout completes first
//   onTimeout?: (msg: string) => void
// ): Promise<T> => {
//   const promise =
//     typeof promiseOrHandler === 'function' ? new Promise<T>(promiseOrHandler) : promiseOrHandler;

//   return timeout
//     ? Promise.race<Promise<T>>([
//       promise,
//       new Promise((_, rej) =>
//         setTimeout(() => {
//           rej(timeoutError);
//           onTimeout && onTimeout(timeoutError);
//         }, timeout)
//       ),
//     ])
//     : promise;
// };

/**
 * Randomize the order of the values of an array, returning a new array.
 * Use the Fisher-Yates algorithm to reorder the elements of the array.
 * > https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#Fisher_and_Yates'_original_method
 */
export const shuffle = ([...arr]) => {
  let m = arr.length;
  while (m) {
    const i = Math.floor(Math.random() * m--);
    [arr[m], arr[i]] = [arr[i], arr[m]];
  }
  return arr;
}

export const isGodwoken = networkSuffix?.startsWith("gw");
export const rpc = isGodwoken ? polyjuiceRPC : defaultRPC;
export const deployer = isGodwoken ? polyjuiceDeployer : defaultDeployer;
