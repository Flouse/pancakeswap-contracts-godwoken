import {
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
  sleep,
  unit,
} from "./common";
import Faucet from "../artifacts/contracts/Faucet.sol/Faucet.json";
import { IFaucet, IMintableToken, txOverrides } from "./deploy";
import MintableToken from "../artifacts/contracts/MintableToken.sol/MintableToken.json";

(async function stressTesting() {
  const gw_short_script_hash =
    ethEoaAddressToGodwokenShortAddress(deployer.address);
  console.log("Deployer's gw_short_script_hash:", gw_short_script_hash);

  const tokenSymbols = Object.keys(tokens);
  const transactionSubmitter = await TransactionSubmitter.newWithHistory(
    `deploy${networkSuffix ? `-${networkSuffix}` : ""}.json`,
    Boolean(process.env.IGNORE_HISTORY),
  );

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
    tokenAddresses.push(await deployToken(name, symbol));
  }
  const tokenContracts = tokenAddresses.map((tokenAddress) => {
    return new Contract(
      tokenAddress,
      MintableToken.abi,
      deployer,
    ) as IMintableToken;
  });

  // keep minting for stress testing
  while (true) {
    // TODO 计时, add mintingSet, 计算成功率
    const num = Math.floor(Math.random() * 10000);

    try {
      console.log(`Minting ${num} ${tokenSymbols.join(", ")}`);

      faucet.mint(
        tokenContracts.map((token) => token.address),
        unit(num),
        txOverrides,
      ).then(res => res.wait(1)
      ).then(async receipt => {
        if (receipt == null) {
          throw new Error("    Transaction has no receipt");
        }
        console.log(`    Balances(${tokenSymbols.join(", ")}):`,
          (await Promise.all(tokenContracts.map((token) =>
            token.callStatic.balanceOf(gw_short_script_hash),
          ))).map((bn) => bn.div(constants.WeiPerEther.div(1e9)).toNumber() / 1e9)
            .join(", "),
        )
      }).catch(console.error);

      // TODO: Add liquidity

    } catch (error) {
      console.error(error);
    }

    await sleep(1000);
  }

  async function deployToken(name: string, symbol: string) {
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
