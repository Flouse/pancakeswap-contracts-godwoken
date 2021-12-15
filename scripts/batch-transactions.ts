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
  retry,
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

(async function stressTesting() {
  const randomIdx = Math.floor(Math.random() * privKeys.length);

  privKeys.slice(randomIdx, randomIdx + 5).forEach(async (privKey, idx) => {
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
    await retry(
      () => deployContracts(deployer, transactionSubmitter),
      6, 30000).catch(console.error);

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

    // stress testing
    setInterval(async () => {
      // TODO add mintingSet, 计算成功率

      const num = Math.floor(Math.random() * 10000);

      try {
        // minting
        console.log(`${idx}: Minting ${num} ${tokenSymbols.join(", ")}`);
        console.time(`  ${idx}-mint ${num}`);
        let response = await faucet.mint(
          tokenContracts.map((token) => token.address),
          unit(num),
          txOverrides,
        );
        // let timeoutID = setTimeout(() => {
        //   console.timeEnd(`  ${idx}-mint ${num}`);
        //   // console.error("    Failed to mint:", reason.message ?? reason);
        //   throw new Error(`${idx}-mint ${num} timeout`);
        // }, 6000);
        // let receipt = await response.wait(1);
        // clearTimeout(timeoutID);
        // if (receipt == null) {
        //   throw new Error("    Transaction has no receipt");
        // }
        // console.log(`    Balances(${tokenSymbols.join(", ")}):`,
        //   (await Promise.all(tokenContracts.map((token) =>
        //     token.callStatic.balanceOf(gw_short_script_hash),
        //   ))).map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9)
        //     .join(", "),
        // )
        console.timeEnd(`  ${idx}-mint ${num}`);

        // Add liquidity
        console.log(`${idx}: addLiquidity ${num} ${pairSymbol}`);
        console.time(`  ${idx}-addLiquidity ${num}`);
        response = await pancakeRouter.addLiquidity(
          tokenAAddress,
          tokenBAddress,
          unit(num),
          unit(num),
          unit(num),
          unit(num),
          deployer.address,
          Math.ceil(Date.now() / 1000) + 60 * 20,
          txOverrides,
        );
        // timeoutID = setTimeout(() => {
        //   console.timeEnd(`  ${idx}-addLiquidity ${num}`);
        //   throw new Error(`${idx}-addLiquidity ${num} timeout`);
        // }, 6000);
        // receipt = await response.wait(1);
        // clearTimeout(timeoutID);
        // if (receipt == null) {
        //   throw new Error("    Transaction has no receipt");
        // }

          // const pairAddress = await pancakeFactory.callStatic.getPair(
          //   tokenAAddress,
          //   tokenBAddress,
          // );
          // const pair = new Contract(
          //   pairAddress,
          //   PancakePair.abi,
          //   deployer,
          // ) as IPancakePair;
          // console.log(
          //   `${pairSymbol} reserves:`,
          //   (
          //     (await pair.callStatic.getReserves()).slice(0, 2) as [
          //       BigNumber,
          //       BigNumber,
          //     ]
          //   )
          //     .map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9)
          //     .join(", "),
          // );
          // console.log(
          //   `${pairSymbol} balance:`,
          //   (await pair.callStatic.balanceOf(deployer.address))
          //     .div(constants.WeiPerEther.div(1e9))
          //     .toNumber() / 1e9,
          // );
        console.timeEnd(`  ${idx}-addLiquidity ${num}`);
      } catch (err: any) {
        console.error('='.repeat(80));
        console.error(err.message ?? err);
      }
    }, 6000);
  });

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
