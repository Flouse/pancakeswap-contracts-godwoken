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
  polyjuiceConfig,
  polyjuiceRPC,
  retry,
  sleep,
  unit,
} from "./common";
import Faucet from "../artifacts/contracts/Faucet.sol/Faucet.json";
import { deployContracts, IFaucet, IMintableToken, txOverrides } from "./deploy";
import MintableToken from "../artifacts/contracts/MintableToken.sol/MintableToken.json";
import { PolyjuiceWallet } from "@polyjuice-provider/ethers";

const privKeys = [
  // https://explorer.nervos.org/aggron/address/ckt1qyq20fymanctz533ep5hxvhvfmd4mu7yxveq0vpu3d
  "0x1f1f38c5dff5db1cff72b51876837c72db45efc19306b99dbb24acdfd8cfa9d1",
  // https://explorer.nervos.org/aggron/address/ckt1qyqqtf42x8s2guupnxmmyxkrcryu4c88k89qtm4nja
  "0xb2fd7b6756e049f8168c10b2fa63b60aecb79832551e18599393a01f2c9cbe30",
  // https://explorer.nervos.org/aggron/address/ckt1qyqytk38kxxpkgvsl36sntr57fsskzjwud7q0llq52
  "0x37c482d5b0fe0bf69b3c233f6d1e29ed4c0ac43f9857594a2debc54e21feb86c",
  // https://explorer.nervos.org/aggron/address/ckt1qyqz60wnlnwm6vn04q93kuvy2zdzaymmf4vsw2mcfl
  "0x44de1f43d6fa70f34161a90a7761f9e8cf779910385e469d42cf76b50384abaa",
  // https://explorer.nervos.org/aggron/address/ckt1qyqzqe0m4cju7m5txc7v9k435n9zucx3qdpqm6mgd7
  "0xb15081cf255a65f1b0b1722b931da86a5f0b25431aa8c0f0cebbe747cb361004",
  // https://explorer.nervos.org/aggron/address/ckt1qyqr5jd078v0euv3fjjptj7wjmlsh8lpkr8sqmxnea
  "0x1390c30e5d5867ee7246619173b5922d3b04009cab9e9d91e14506231281a997",
  // https://explorer.nervos.org/aggron/address/ckt1qyqvpyztgdlggsnd9l0d5juvky2des89ecfq7kxn86
  "0x2dc6374a2238e414e51874f514b0fa871f8ce0eb1e7ecaa0aed229312ffc91b0",
  // https://explorer.nervos.org/aggron/address/ckt1qyqwyk39th3jnqhf4wrnlxxse4yf944kqwls6ps0da
  "0x15f0805f5ebabda961cca1e97cdae03919b07d3eee4a9074c075ee2e80f2da9f",
  // https://explorer.nervos.org/aggron/address/ckt1qyqpjc645x2j8565e2ptjdyc55v29e6vlt0sl55grq
  "0xa786cd647b24acbdc8ca46757dff3a930744179b6e20d9d8813c9430f954bd73",
  // https://explorer.nervos.org/aggron/address/ckt1qyq8ysrledg6dd7z2ymvsh6869l5xcwdunyssx3kg9
  "0x21c3849c1d6d150f50806e773458df00c4501118e38f777b4110d50f38d91bfd",
  // https://explorer.nervos.org/aggron/address/ckt1qyqzw6ltsr69pnalq0fvdmsqrgrj6txp4pcstz7nk5
  "0x1bd5d82ce33bfeb5824a919127f3f95c50314c1ca72c1fb7c370f3c79ecbe8e6",
  // https://explorer.nervos.org/aggron/address/ckt1qyqp7ece5ujgjf9a6e0h3xafhht6zt6tpqeqyz0y7f
  "0xacc5997a76ee194e4406b5e4e020efd6ca53dc3276c3d43753d55e936335c25d",
  // https://explorer.nervos.org/aggron/address/ckt1qyq86rkjhn5saavpy53slpfy9m7qzv35mclq8qn2jg
  "0xe2b0be6ffdba34a9d1e906f3a83ad24440ea22673b709306b1bc3b51030f79f3",
  // https://explorer.nervos.org/aggron/address/ckt1qyqg49m3qh6mks7an4vpfxmcz3m8cp7kdasqvf7swv
  "0x65d50620ad7f08ef4da10e9992062626daddc3b68907012ece845e9bbc8c14ff",
  // https://explorer.nervos.org/aggron/address/ckt1qyqdk496m2fgaxura9fdhf9va3t7nacyjcusqjrzn2
  "0xd1017ca5b9f0242818a33acd18911caadab84c8c92331eb2ecd2b44895e1d099",
  // https://explorer.nervos.org/aggron/address/ckt1qyqv9afd6sgg6zrtl2vuvpeym2t3ehgt9gzsqh9rp9
  "0x991494a67bcfa4c30807f5a1426eaad2b79845672913c259da16926711328ae9",
  // https://explorer.nervos.org/aggron/address/ckt1qyqqhgjx0qa3nqs96zhehk979r3wywjsp4hs2cwd5h
  "0x7f52aecd6e71e2ca3c6dd4b2b82212767598006aee0718f140a8bd0647d2832c",
  // https://explorer.nervos.org/aggron/address/ckt1qyqvl4n3dujpews0w9e7gj08zckjxk8xessqmkhp9m
  "0x3826f69f59026faca8aa97f40cd512597b8801ebc40a88db19216d1742fdf4e7",
  // https://explorer.nervos.org/aggron/address/ckt1qyq8m8vwfe4md75hz6yl3a498fcl7x70pxgqdf2ms7
  "0x6edf8a51e2abb4543cacaa57aee366c95d25c8cffe4b41b0a7431d902c81080b",
  // https://explorer.nervos.org/aggron/address/ckt1qyqyc3acg5xf4cqjmekntftzm3k8vy7n3uls437h4c
  "0xdc181bbbc3d89ffad393e556949b56e2b44d2d4050d931262b559ef08e5eaf41",
  // https://explorer.nervos.org/aggron/address/ckt1qyq04l22jus670ynvcght6cn5ujqe9nygmcslrv3cu
  "0xb9a9aafa95299e1d149aca1f002e20a697846889c6540cd37a99193cdc3e742a",
  // https://explorer.nervos.org/aggron/address/ckt1qyqdr28xv8mwhfg2zmqa5qvefr3ld6zyaa2sgphu8p
  "0x2adc9f91e9686c0838c990e0ad9893ba32fdffa33341eb295cef3b1b0027d8c8",
  // https://explorer.nervos.org/aggron/address/ckt1qyq0fl2epvja3yp66u8xj0rjzr392sx52s5sr26ffj
  "0xf59c5e9cfe8ed57a4cda42046fa78fdb016002a651eae27bad65b4ade81dad51",
  // https://explorer.nervos.org/aggron/address/ckt1qyq9xyynh9fcctmtkpfmmenj57v5f2gez8tqvtt73z
  "0x68777010f63b24b117f7bb28848b9c841d341b3f02b632ae2f6cdf59c6cd575e",
  // https://explorer.nervos.org/aggron/address/ckt1qyqv87xf6hauqrk20hq2uh9ws2lnl0a5c03s7qe5t9
  "0xd5ffdf1c0c22c29ac05e7fd15113c47d23c59e671032a4a91f88e989c45aa9a5",
  // https://explorer.nervos.org/aggron/address/ckt1qyqwdjzcydj5xacut7hxkunx97lk3h2txfhqjpc8t4
  "0x423bcbaf313bba759f32860277338eceebfae3fd1f424c9920d0e396f6d08139",
  // https://explorer.nervos.org/aggron/address/ckt1qyqg4r47rk46nlh4mhl4h7q8peyaw42kl84q2cdykq
  "0x4f05777a56806bda4d6869ceb05ba77992a818839b04131d04cded4f7a545c70",
  // https://explorer.nervos.org/aggron/address/ckt1qyq8wllm5kxxrluzac4ppl7s7w2ermsn76cshlwnlg
  "0x63a83772e6e06289355fc49179a3b9af7c74a43c679d28430caf31fe6a329cc4",
  // https://explorer.nervos.org/aggron/address/ckt1qyq0wnejc9rpj4vqf2qvx880ekzq2d8sxawqk7reqs
  "0xf9eba38eacf61f3d19a75c3777ddac5fe5e6d6a88ebba84b2cff83a33bbe336d",
  // https://explorer.nervos.org/aggron/address/ckt1qyqy9858p0klgh7c5s0h2q4xfwnxx8ahx5gqxkymwk
  "0x6ce28df6f9d6133c84a5eb61585fe7b4a9290cbdcc7ae8aa4552743220e1ffc4",
  // https://explorer.nervos.org/aggron/address/ckt1qyqtstccnzjnavargr8fx5vytyyscwyjc07q32tlpl
  "0x83eadd19be6bcc45491b2cfa9b8165a8c3a88db6b9aa3e21c71da3a8a4297122",
  // https://explorer.nervos.org/aggron/address/ckt1qyqw3lt8nug4m5wl9ef2emnway3csxy2c5lsfwhsq8
  "0x44d53f416499786cf9c97c5785420672c1bfe83f5813c3120a9da5bb82eea4e6",
  // https://explorer.nervos.org/aggron/address/ckt1qyq0x70yqeeajg2mjk40msflj30ly3gwn79slr4phw
  "0x36137042101a97767c1b10ce6116e9e281867180628df6477ce0d16ad086a05e",
  // https://explorer.nervos.org/aggron/address/ckt1qyqtfjgejmm2wf62edhvtu6eqs0m2wms08ts2tch79
  "0xf44ee8a762e57f11cc016a84ef310a99570a0034ce9cd362dcf998ba6e9f3322",
  // https://explorer.nervos.org/aggron/address/ckt1qyqw5w9h0l5reuqt0d6mw2lmmlkrfw50673sgzff95
  "0x80993eea293b3403b5ba1fbf5b2ee5a16415af1fce92de838b48c065a5f21480",
  // https://explorer.nervos.org/aggron/address/ckt1qyqpr828nn08v8tsupv0ra4tpfthzgx8f48qqeulcw
  "0xf2d474fbf5ba475051974981c8d47af2c882b44b134608bd36397c57ea944797",
  // https://explorer.nervos.org/aggron/address/ckt1qyqpfwu0d9mq80kuuxwf9qavewhdmxwdqx2spsc7a8
  "0xb4d053c3e22ac36792504bff325dc225ba15f9c7dace139710008d41b526fb7f",
  // https://explorer.nervos.org/aggron/address/ckt1qyqp7sl5qhpqwqjdr3meksrkufzkhtd5t6hslml2xp
  "0xc27a8b82c7ea9b39ba736cd5e22e7a0b0fc82a5e67cbda8c2187a847d3c8a364",
  // https://explorer.nervos.org/aggron/address/ckt1qyqtmeserp0pjr5mk8ku3ceu4frzlmqanmus5ehurq
  "0xc6622bf4ff5ecce0e8c57742a9ea596226a4c9f78ff516e3797c9bc6c6b95e29",
  // https://explorer.nervos.org/aggron/address/ckt1qyqqpjq3fr84uavknxhw8w5pdjsd44n375xsgqn0t0
  "0x72a37607ce365b953382c1ea05ea0712e9b88fd3d77a72e8468f7994d46eac02",
  // https://explorer.nervos.org/aggron/address/ckt1qyqt3lvxnjtg6qrmm0h9hl6yazta8yuefwms0595qr
  "0x79487e2a3785d94fe6f24f3541ac41f8ae8d5710bd14bd78394dfd135225d79b",
  // https://explorer.nervos.org/aggron/address/ckt1qyqtkddwtyf6xtnl4ru3uz7l2zvyj7ytw44s2ad5zg
  "0x2b296d33e656a6c9367f94301c6781a1401ce20d8cb02722bff676617ffb8dac",
  // https://explorer.nervos.org/aggron/address/ckt1qyq9y9fn7mlahdklqy9ut5r7lfhze9fqkldqgn2yv8
  "0xf08f514aa63d99c2aca190b8eaa181cd6783f2b7b229fc7cacb4ca2c4438f5e5",
  // https://explorer.nervos.org/aggron/address/ckt1qyqgm89sgpuc55yf400jelg7ep6g82rs6kvqt7qzrc
  "0x459dbf4bed9a5698901fcdbb385afb6ead57efa28ca214d96552688e7b7d6a90",
  // https://explorer.nervos.org/aggron/address/ckt1qyqffg7jp00kr5uv852anfjhtmfaxr07z2ms22e33h
  "0x493f323254166759df26aeb7d9c09b580d87cf12339cb45c1a6c9405e223a805",
  // https://explorer.nervos.org/aggron/address/ckt1qyqy67ty60mn5cdt38w93nu407tynwt635msxk5xtz
  "0xb66d31cb8d1490f9517e7471be480857d8d5b0b8a6e667a02ffa792e82928daf",
  // https://explorer.nervos.org/aggron/address/ckt1qyqtsaa5awqh8gw6qp2tr8md68hq3qegwhlqtx3nnp
  "0xbd76398458cde6292427ec0db469b3a5860bd8685b3fa96c0b7b59c7dbc1e57e",
  // https://explorer.nervos.org/aggron/address/ckt1qyq97g833fferm20avdag8ev34uj5f8n408s24h3vs
  "0xb027d7c1091c54b3d473ad1f4261814e4619e3de8de47d07c85d84f1b68907ed",
  // https://explorer.nervos.org/aggron/address/ckt1qyqflyw5x5d6h2d6lxw48neqea3srl7jhtcsrfe5gx
  "0xb77f3f3edc8152dbc4df1ac3925c31fc309973404d0218d2da168aaa1c6d0073",
  // https://explorer.nervos.org/aggron/address/ckt1qyq87glt8rqkqgrlxqnmz70g9jl0wtqhfw7sr2cazq
  "0x3d4e207533110f034cb90472637cffc6037312a859978c499ff8ae055d273845",
  // https://explorer.nervos.org/aggron/address/ckt1qyqq0g29mg5lx8tcdwke7wr48yt44sc8nhqq5zmgde
  "0xcf144a989c711b28d0ec0c735ca3092acf03df3b58bc718698ecd836b57c5968",
  // https://explorer.nervos.org/aggron/address/ckt1qyq8slkqddr3zlgn49y9njtjzjqn0esmn94qkql96h
  "0xe515a1f6c356ecc1702524ad567df9c020e4c02f16c870fcaa8334bc1f7f56e5",
  // https://explorer.nervos.org/aggron/address/ckt1qyqy5ngdep9pwvrpg2cx3y4k3hrapf69sr7qjlxmgk
  "0x418286b7021fb191b15e9d963fb83d55e7f24e796bee2e2eff340c6b135c1be9",
  // https://explorer.nervos.org/aggron/address/ckt1qyqyzwxj35ka5mfwdqeq85z06amj9f7aaresc68wdp
  "0xb8b52a5c6d79b7af3cdd44eaba34821f27f5b08ef7d8296757bcf68c97f6761c",
  // https://explorer.nervos.org/aggron/address/ckt1qyqytf6kedsdcmyhwzx2fwpqamrp6p8vag3qtupktx
  "0x4d2f0c443e26798b88547af021265ef16f51f8a709c71512797256def49cfc88",
  // https://explorer.nervos.org/aggron/address/ckt1qyqy68x7sx4p6raesg3dd3dq34c96jt7kk0smc2agx
  "0x406cefdac85d440a4b289051fb899d2501669eceb798022d90a3d6e7debd0e67",
  // https://explorer.nervos.org/aggron/address/ckt1qyqflym3h9xtkepe207n85570t0wf4vvctgszt3tcs
  "0x48ea4a2d7d375e0e796b4fdc58c83f513d6e654a4cc1d7c47eb6ab6f7495788a",
  // https://explorer.nervos.org/aggron/address/ckt1qyqfpwjjruw7tx2vs0eum6gqlnt4gau6yl8s5gcanx
  "0x1fbbb89185b44ee6293d0e6a69d705c0cbc1a31515f3c310f003e320c67a6f8f",
  // https://explorer.nervos.org/aggron/address/ckt1qyqxwwqk3eln2yvlq8nr6z0uwplxj474yweqnche5z
  "0x84388dca5161014f5af2cb1548e12d0b3cd440ba9ddbc741445b5505aeee7faa",
  // https://explorer.nervos.org/aggron/address/ckt1qyqdk4leldxuhherglhe8kseutxv8cwm2lnqpf8laz
  "0xae30fa0b1eb0910ba3b446b6cb1aa6a0dc3842404cfa57556b50da6f21b28581",
  // https://explorer.nervos.org/aggron/address/ckt1qyqw4ngmqfw98qsmr6je56ycvd5zs2wjx78qlyqgvp
  "0x8ce913701ddf7da2b97a9241eceac1d4610effc93b416dfaf8021784a5440257",
  // https://explorer.nervos.org/aggron/address/ckt1qyqvc6az8x25pchhy5a5dc5q402wgyr5775qzdpt9v
  "0x4eb74d85f7af7bad824e8cd281ad51d934997f82fde184ee8540c53d845eee2a",
  // https://explorer.nervos.org/aggron/address/ckt1qyqdghcvferfgf8ucsha8sne970y8hpcznjs524sla
  "0xd97c287fb441f6b1235494535fcd876f362a6b956fe8e7d56866842f0906fc59",
  // https://explorer.nervos.org/aggron/address/ckt1qyq8zlakxtstxle28tpkel90l648449afruqa6aza3
  "0x9b97552a1745e43d890655c615a1c41242485351c8242708890ec6ab72c18404",
  // https://explorer.nervos.org/aggron/address/ckt1qyqv4lsuw0ldp8wh6ypy855jjqjqs8v2zges54am88
  "0x60d9b26c641569911a95bb18521ba148b6ac64025e4a11dd0c0649392fbc1c10",
];

(async function stressTesting() {
  const randomIdx = Math.floor(Math.random() * privKeys.length);
  [privKeys[randomIdx]].forEach(async (privKey, idx) => {
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
      `deploy${networkSuffix ? `-${networkSuffix}-${gw_short_script_hash}` : ""}.json`,
      Boolean(process.env.IGNORE_HISTORY),
    );

    // deploy pancakeswap contracts first
    await retry(
      () => deployContracts(deployer, transactionSubmitter),
      6, 60000).catch(console.error);

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

    // keep minting for stress testing
    setInterval(() => {
      // TODO add mintingSet, 计算成功率
      const num = Math.floor(Math.random() * 10000);
      console.time(`${idx}-${gw_short_script_hash}-${num}`);

      try {
        console.log(`${idx}: Minting ${num} ${tokenSymbols.join(", ")}`);

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
          console.timeEnd(`${idx}-${gw_short_script_hash}-${num}`);
        }).catch(console.error);

        // TODO: Add liquidity

      } catch (error) {
        console.error(error);
      }
    }, 3000);
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
