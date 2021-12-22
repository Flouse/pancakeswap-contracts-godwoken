import {
  BigNumber,
  constants,
  Contract,
  ContractFactory
} from "ethers";
import { tokens } from "./config";
import { TransactionSubmitter } from "./TransactionSubmitter";
import {
  deployer,
  ethEoaAddressToGodwokenShortAddress,
  networkSuffix,
  polyjuiceConfig,
  polyjuiceRPC,
  promiseAllLimitN,
  retry,
  shuffle,
  sleep,
  unit,
} from "./common";
import Faucet from "../artifacts/contracts/Faucet.sol/Faucet.json";
import { deployContracts, IFaucet, IMintableToken, IPancakeFactory, IPancakePair, IPancakeRouter, txOverrides } from "./deploy";
import MintableToken from "../artifacts/contracts/MintableToken.sol/MintableToken.json";
import { PolyjuiceWallet } from "@polyjuice-provider/ethers";
import PancakeRouter from "../artifacts/contracts/PancakeRouter.sol/PancakeRouter.json";
import PancakeFactory from "../artifacts/contracts/PancakeFactory.sol/PancakeFactory.json";
import WETH from "../artifacts/contracts/WETH9.sol/WETH9.json";
import PancakePair from "../artifacts/contracts/PancakePair.sol/PancakePair.json";
import { privKeys } from "./accounts";

let mintJobs: (() => Promise<void>)[] = [];
let pancakeRouters: (() => Promise<void>)[] = [];

(async function stressTesting() {
  // init the deploy jobs with random order
  const deployJobs = shuffle(privKeys).map(privKey => async (): Promise<string | void> => {
    const deployer = new PolyjuiceWallet(
      privKey,
      polyjuiceConfig,
      polyjuiceRPC,
    );

    const gw_short_script_hash =
      ethEoaAddressToGodwokenShortAddress(deployer.address);
    console.log("Deployer's gw_short_script_hash:", gw_short_script_hash);

    const tokenSymbols = Object.keys(tokens);
    const transactionSubmitter = await TransactionSubmitter.newWithHistory(
      `history/${networkSuffix}-${gw_short_script_hash}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    );

    // deploy pancakeswap contracts first
    try {
      await retry(() => Promise.race([
        deployContracts(deployer, transactionSubmitter),
        new Promise((_, rej) =>
          setTimeout(() => rej(`${gw_short_script_hash} timeout`), 60000)),
      ]), 3, 30000).catch(reason => {
        console.error(`Failed to deploy contracts for ${gw_short_script_hash}:`,
          "\n  reason:", reason);
        throw new Error(`Failed to deploy contracts for ${gw_short_script_hash}`);
      });
    } catch (error) {
      console.error(error);
      return Promise.reject('skip');
    }

    const deployFaucetReceipt = await transactionSubmitter.submitAndWait(
      "Deploy Faucet",
      () => {
        const implementationFactory = new ContractFactory(
          Faucet.abi,
          Faucet.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction();
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );
    const faucetAddress = deployFaucetReceipt.contractAddress;
    const faucet = new Contract(faucetAddress, Faucet.abi, deployer) as IFaucet;

    const tokenAddresses: string[] = [];
    for (const [symbol, name] of Object.entries(tokens)) {
      tokenAddresses.push(await deployToken(name, symbol, transactionSubmitter));
    }
    const tokenContracts = tokenAddresses.map((tokenAddress) => {
      return new Contract(
        tokenAddress,
        MintableToken.abi,
        deployer,
      ) as IMintableToken;
    });

    const deployPancakeFactoryReceipt = await transactionSubmitter.submitAndWait(
      `Deploy PancakeFactory`,
      () => {
        const implementationFactory = new ContractFactory(
          PancakeFactory.abi,
          PancakeFactory.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction(
          deployer.address,
        );
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );
    const pancakeFactoryAddress = deployPancakeFactoryReceipt.contractAddress;
    const pancakeFactory = new Contract(
      pancakeFactoryAddress,
      PancakeFactory.abi,
      deployer,
    ) as IPancakeFactory;
    const deployWETHReceipt = await transactionSubmitter.submitAndWait(
      "Deploy WETH",
      () => {
        const implementationFactory = new ContractFactory(
          WETH.abi,
          WETH.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction();
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );
    const wethAddress = deployWETHReceipt.contractAddress;
    console.log(`    WETH address:`, wethAddress);
    const deployPancakeRouterReceipt = await transactionSubmitter.submitAndWait(
      `Deploy PancakeRouter`,
      () => {
        const implementationFactory = new ContractFactory(
          PancakeRouter.abi,
          PancakeRouter.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction(
          pancakeFactoryAddress,
          wethAddress,
        );
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );
    const pancakeRouterAddress = deployPancakeRouterReceipt.contractAddress;
    console.log(`    PancakeRouter address:`, pancakeRouterAddress);
    const pancakeRouter = new Contract(
      pancakeRouterAddress,
      PancakeRouter.abi,
      deployer,
    ) as IPancakeRouter;
    const [tokenAAddress, tokenBAddress, pairSymbol] =
      tokenAddresses[0].toLowerCase() < tokenAddresses[1].toLowerCase()
        ? [
          tokenAddresses[0],
          tokenAddresses[1],
          `${tokenSymbols[0]}-${tokenSymbols[1]}`,
        ]
        : [
          tokenAddresses[1],
          tokenAddresses[0],
          `${tokenSymbols[1]}-${tokenSymbols[0]}`,
        ];

    const mintJob = async () => {
      const num = Math.floor(Math.random() * 1000);
      console.log(`${deployer.address} is minting ${num} ${tokenSymbols.join(", ")}`);
      console.time(`mint ${num}`);
      await Promise.race([
        sleep(6000).then(() => { throw new Error(`mint ${num} timeout`); }),
        faucet.mint(
          tokenContracts.map((token) => token.address),
          unit(num),
          txOverrides,
        ),
      ]).catch(console.error)
        .finally(() => console.timeEnd(`mint ${num}`));
    }
    mintJobs.push(mintJob);
  });

  promiseAllLimitN(2, deployJobs).catch(reason => {
    console.error(`promiseAllLimitN Error:`, reason);
  });

  // exit after 5 hours
  setTimeout(() => process.exit(0), 5 * 60 * 60000);
  while (true) {
    await sleep(3000 / (mintJobs.length + 1));
    if (mintJobs.length < 10) continue;
    const randomIdx = Math.floor(Math.random() * mintJobs.length);
    console.log(`  [${randomIdx}/${mintJobs.length}]:`);
    mintJobs[randomIdx]().catch(console.error);
  }

  async function deployToken(name: string, symbol: string, transactionSubmitter: TransactionSubmitter) {
    const receipt = await transactionSubmitter.submitAndWait(
      `Deploy ${symbol}`,
      () => {
        const implementationFactory = new ContractFactory(
          MintableToken.abi,
          MintableToken.bytecode,
          deployer,
        );
        const tx = implementationFactory.getDeployTransaction(name, symbol);
        tx.gasPrice = txOverrides.gasPrice;
        tx.gasLimit = txOverrides.gasLimit;
        return deployer.sendTransaction(tx);
      },
    );
    const address = receipt.contractAddress;
    console.log(`    ${symbol} address:`, address);
    return address;
  }
})();

