require("dotenv").config();
const express = require("express");
const cors = require("cors");

const moment = require("moment");

const crypto = require("crypto");
const accounts = require("web3-eth-accounts");
const ethers = require("ethers");

const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 100, checkperiod: 120 });
const axios = require("axios");

const redis = require("async-redis");

const erc_20_abi = require("../abis/ERC20.json");
const market_abi = require("../abis/Market.json");
const registry_abi = require("../abis/Registry.json");
const vault_abi = require("../abis/Vault.json");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const OWNER = process.env.OWNER || "0x155c21c846b68121ca59879B3CCB5194F5Ae115E";

const use_redis = process.env.CACHE === "redis" || false;
let redisClient;

// use memory or redis cache
const setCache = async (key, value, seconds) => {
  if (use_redis) {
    await redisClient.set(key, value);
  }

  await cache.set(key, value, seconds);
};

const getCache = async key => {
  if (use_redis) {
    const result = await redisClient.get(key);
    return result;
  }

  return await cache.get(key);
};

const getProvider = () => {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28",
    5
  );
  return provider;
};

const getNonce = () => {
  const nonce = crypto.randomUUID();
  // const _nonce = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(nonce));
  return nonce;
};

const sign = payload => {
  const private_key = process.env.PRIVATE_KEY;
  const ethAccounts = new accounts();
  const signature = ethAccounts.sign(payload, private_key);

  return signature;
};

const signMessage = async message => {
  const private_key = process.env.PRIVATE_KEY;

  const wallet = new ethers.Wallet(private_key);
  return await wallet.signMessage(message);
};

const getToday = format => {
  const today = new Date().toLocaleString("en-US", {
    timeZone: "Australia/Brisbane"
  });
  moment.suppressDeprecationWarnings = true;
  return moment(today).format(format ?? "YYYY-MM-DD");
};

const getMeetings = async date => {
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${date}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
    headers: {}
  };

  const response = await axios(config);

  const meetings = response.data.meetings.map(meet => {
    const meeting = {};
    meeting.id = meet.venueMnemonic ?? "";
    meeting.name = meet.meetingName.toUpperCase();
    meeting.location = meet.location.toUpperCase();
    meeting.date = moment(meet.meetingDate).format("YYYY-MM-DD");
    meeting.races = meet.races.map(r => {
      const start = moment(r.raceStartTime);

      const race = {};
      race.number = r.raceNumber;
      race.name = r.raceName.toUpperCase();
      race.start = start;
      race.start_unix = start.unix();
      race.end = start.add(30, "minute");
      race.end_unix = start.add(30, "minute").unix();
      race.close = start.add(-2, "minute");
      race.close_unix = start.add(-2, "minute").unix();

      return race;
    });

    return meeting;
  });

  return meetings;
};

app.get("/", (req, res) => {
  const today = getToday("YYYY-MM-DD");
  const message = `Hello World ${today}`;
  const signature = sign(message);
  res.send(`${message} ${signature.signature}`);
});

const getMarketAddresses = async provider => {
  const registeryAddress =
    process.env.REGISTRY_CONTRACT ||
    "0x5Df377d600A40fB6723e4Bf10FD5ee70e93578da";
  const contract = new ethers.Contract(
    registeryAddress,
    registry_abi.abi,
    provider
  );

  const count = await contract.marketCount();
  const markets = [];

  for (let i = 0; i < Number(count) - 1; i++) {
    const market = await contract.markets(i);
    markets.push(market);
  }

  console.log(markets);
  return markets;
};

const getMarketDetails = async (provider, address) => {
  const marketContract = new ethers.Contract(address, market_abi.abi, provider);
  const vaultAddress = await marketContract.getVaultAddress();
  const vaultContract = new ethers.Contract(
    vaultAddress,
    vault_abi.abi,
    provider
  );

  const [name, target, totalInPlay] = await Promise.all([
    vaultContract.name(),
    marketContract.getTarget(),
    marketContract.getTotalInplay()
  ]);

  const market = {
    address,
    vaultAddress,
    name,
    target,
    totalInPlay: ethers.utils.formatEther(totalInPlay)
  };

  return market;
};

app.get("/markets", async (req, res) => {
  const cached_markets = await getCache("markets");
  if (cached_markets) {
    res.send(cached_markets);
    return;
  }

  const response = await getMarketAddresses(getProvider());
  await setCache("markets", response, 60 * 60 * 24);

  res.send(response);
  res.end();
});

app.get("/markets/:address", async (req, res) => {
  const address = req.params.address;
  const cached_market = await getCache(`market-${address}`);
  if (cached_market) {
    res.send(cached_market);
    return;
  }

  const response = await getMarketDetails(getProvider(), address);
  await setCache(`market-${address}`, response, 60);

  res.send(response);
  res.end();
});

app.get("/markets/details", async (req, res) => {
  let market_addresses = await getCache("markets"); // todo: market address

  if (!market_addresses) {
    market_addresses = await getMarketAddresses(getProvider());
    await setCache("markets", market_addresses, 60 * 60 * 24);
  }

  const markets = [];
  for (let i = 0; i < market_addresses.length; i++) {
    const market = await getMarketDetails(getProvider(), market_addresses[i]);
    console.log(market);
    markets.push(market);
  }

  res.send(markets);
  res.end();
});

const getVaultAddresses = async provider => {
  const registeryAddress =
    process.env.REGISTRY_CONTRACT ||
    "0x5Df377d600A40fB6723e4Bf10FD5ee70e93578da";
  const contract = new ethers.Contract(
    registeryAddress,
    registry_abi.abi,
    provider
  );

  const count = await contract.vaultCount();
  const vaults = [];

  for (let i = 0; i < Number(count) - 1; i++) {
    const vault = await contract.vaults(i);
    vaults.push(vault);
  }

  return vaults;
};

app.get("/vaults", async (req, res) => {
  const cached_vaults = await getCache("vaults");
  if (cached_vaults) {
    res.send(cached_vaults);
    return;
  }

  const response = await getVaultAddresses(getProvider());
  await setCache("vaults", response, 60 * 60 * 24);

  res.send(response);
  res.end();
});

app.get("/vaults/:address", async (req, res) => {
  const address = req.params.address;
  const cached_vault = await getCache(`vault-${address}`);
  if (cached_vault) {
    res.send(cached_vault);
    return;
  }
  const provider = getProvider();

  const vaultContract = new ethers.Contract(address, vault_abi.abi, provider);
  const [bNTotalAssets, tokenAddress] = await Promise.all([
    vaultContract.totalAssets(),
    vaultContract.asset()
  ]);

  const tokenContract = new ethers.Contract(
    tokenAddress,
    erc_20_abi.abi,
    provider
  );
  const [name, symbol, decimals] = await Promise.all([
    tokenContract.name(),
    tokenContract.symbol(),
    tokenContract.decimals()
  ]);

  const vault = {
    name,
    symbol,
    totalAssets: ethers.utils.formatUnits(bNTotalAssets, decimals),
    address
  };

  await setCache(`vault-${address}`, vault, 60);

  res.send(vault);
  res.end();
});

//
app.get("/runners/:track/:race/win", async (req, res) => {
  const today = getToday("YYYY-MM-DD");

  const track = req.params.track;
  const race = req.params.race;

  const market_id = `${today}_${track}_${race}_W`;
  const cached_runners = await getCache(market_id);
  let runners;

  if (!cached_runners) {
    // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-04-17/meetings/R/DBO/races/1?jurisdiction=QLD
    // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-08-28/meetings/R/SSC/races/1?returnPromo=false&returnOffers=false&jurisdiction=QLD

    const config = {
      method: "get",
      url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings/R/${track}/races/${race}?jurisdiction=QLD&returnPromo=false`,
      headers: {}
    };

    const result = await axios(config);
    const now = moment().unix();

    const nonce = getNonce();
    const close = 0;
    const end = now + 60 * 60 * 12;

    runners = result.data.runners.map(item => {
      const odds = item.fixedOdds.returnWin * 1000;

      const runner = {};
      runner.nonce = nonce;
      runner.number = item.runnerNumber;
      runner.name = item.runnerName.toUpperCase();
      runner.market_id = market_id;
      runner.close = close;
      runner.end = end;
      runner.odds = odds; // todo: get precision from contract
      runner.proposition_id = `${market_id}${item.runnerNumber}`;

      runner.barrier = item.barrierNumber;

      runner.signature = sign(
        `${nonce}-${market_id}${item.runnerNumber}-${odds}-${close}-${end}`
      );

      return runner;
    });

    await setCache(market_id, runners, 10);
  }

  const sumOfOdds = runners.reduce((a, b) => a + b.odds, 0);

  const runners_response = {
    owner: OWNER,
    data: runners,
    sumOfOdds: sumOfOdds,
    signature: "", // signature.signature,
    hash: "" //signature.hash
  };

  res.json(runners_response);
});

//
app.get("/meetings", async (req, res) => {
  const meetings = await getCache("meetings");
  if (!meetings) {
    const today = getToday("YYYY-MM-DD");
    const result = await getMeetings(today);

    await setCache("meetings", result, 60);
  }

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    nonce: getNonce(),
    created: now,
    expires: now + 60 * 1000,
    meetings: await getCache("meetings")
  };

  const signature = sign(meetings_response);

  const response = {
    owner: OWNER,
    data: meetings_response,
    signature: signature.signature,
    hash: signature.hash
  };

  res.json(response);
});

//
app.get("/meetings/:date", async (req, res) => {
  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-05-14/meetings?jurisdiction=QLD

  const meetings = await getMeetings(req.params.date);
  await setCache("meetings", meetings, 60);

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    nonce: getNonce(),
    created: now,
    expires: now + 60 * 1000,
    meetings: await getCache("meetings")
  };

  const signature = sign(meetings_response);

  const response = {
    owner: OWNER,
    data: meetings_response,
    signature: signature.signature,
    hash: signature.hash
  };

  res.json(response);
});

app.get("/odds/:market", async (req, res) => {
  const contractAddress = req.params.market;
  const contract = new ethers.Contract(
    contractAddress,
    market_abi.abi,
    getProvider()
  );

  const odds = ethers.BigNumber.from(req.query.odds);
  const wager = ethers.BigNumber.from(req.query.wager);
  const proposition_id = req.query.proposition_id;

  const result = await contract.getOdds(odds, wager, proposition_id);

  res.json({ result });
});

app.get("/results/:fullid", async (req, res) => {
  // https://www.tab.com.au/racing/2022-10-20/GATTON/B/R/1

  // `${today}_${track}_${race}_W`
  const proposition_id = req.params.fullid;
  const parts = proposition_id.split("_");

  if (parts.length !== 4) {
    res.json({ error: "invalid proposition id" });
    return;
  }

  const date = parts[0];

  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/historical-results-service/QLD/racing/${date}`,
    headers: {}
  };

  const results = await axios(config);

  const races = results.data.meetings.find(m => m.location === parts[1]);
  const result = races.find(r => r.raceNumber === parts[2]);

  res.json(result);
});

/**
 * @param {Object} [placeEventFilter]
 * @param {string} [placeEventFilter.owner]
 */
const getHistory = async placeEventFilter => {
  const provider = getProvider();
  let markets = await getCache("markets");
  if (!markets) {
    markets = await getMarketAddresses(provider);
    await setCache("markets", markets, 60);
  }

  const results = [];

  for (let i = 0; i < markets.length; i++) {
    const market = new ethers.Contract(markets[i], market_abi.abi, provider);

    const placedFilter = await market.filters.Placed(
      null,
      null,
      null,
      placeEventFilter?.owner
    );
    const placedLogs = await market.queryFilter(placedFilter);

    for (let j = 0; j < placedLogs.length; j++) {
      const { args, transactionHash, blockNumber } = placedLogs[j];
      const [proposition_id, amount, payout, owner] = args;
      const signature = await signMessage(proposition_id);
      results.push({
        index: j,
        market_id: market.address,
        proposition_id,
        punter: owner,
        amount: ethers.utils.formatUnits(amount, 18),
        tx: transactionHash,
        blockNumber,
        signature
      });
    }
  }

  return results;
};

app.get("/history", async (req, res) => {
  const results = await getHistory();
  res.json({ results });
});

app.get("/history/:account", async (req, res) => {
  const results = await getHistory({
    owner: req.params.account
  });
  res.json({ results });
});

app.get("/vaults/performance", async (req, res) => {
  const provider = getProvider();
  let vaults = await getCache("vaults");
  if (!vaults) {
    vaults = await getVaultAddresses(provider);
    await setCache("vaults", vaults, 3600);
  }

  let performance = ethers.BigNumber.from(0);

  for (let i = 0; i < vaults.length; i++) {
    const vault = new ethers.Contract(vaults[i], vault_abi.abi, provider);
    const _performance = await vault.getPerformance().catch(e => {
      console.error(e);
      return ethers.BigNumber.from(0);
    });
    performance = performance.add(_performance);
  }

  res.json({ performance: performance.toString() });
});

app.get("/vault/:id/performance", async (req, res) => {
  const provider = getProvider();
  let vaults = await getCache("vaults");
  if (!vaults) {
    vaults = await getVaultAddresses(provider);
    await setCache("vaults", vaults, 3600);
  }

  let performance = 0.0;

  for (let i = 0; i < vaults.length; i++) {
    const vault = new ethers.Contract(vaults[i], vault_abi.abi, provider);

    const _performance = await vault.getPerformance();
    performance += Number(_performance);
  }

  res.json({ performance });
});

app.get("/vaults/liquidity", async (req, res) => {
  const provider = getProvider();
  let vaults = await getCache("vaults");
  if (!vaults) {
    vaults = await getVaultAddresses(provider);
    await setCache("vaults", vaults, 3600);
  }

  let assets = ethers.BigNumber.from(0.0);

  for (let i = 0; i < vaults.length; i++) {
    const vault = new ethers.Contract(vaults[i], vault_abi.abi, provider);

    const _assets = await vault.totalAssets();
    assets = assets.add(_assets);
  }

  res.json({ assets: ethers.utils.formatUnits(assets, 18) });
});

app.get("/inplay", async (req, res) => {
  const provider = getProvider();
  let markets = await getCache("markets");
  if (!markets) {
    markets = await getMarketAddresses(provider);
    await setCache("markets", markets, 3600);
  }

  let total = ethers.BigNumber.from(0.0);

  for (let i = 0; i < markets.length; i++) {
    const market = new ethers.Contract(markets[i], market_abi.abi, provider);

    const inplay = await market.getTotalInplay(); // Todo: change to getTotalInPlay
    total = total.add(inplay);
  }

  res.json({ total: ethers.utils.formatUnits(total, 18) });
});

// app.get("/faucet", async (req, res) => {
//   const provider = new ethers.providers.JsonRpcProvider(
//     process.env.NODE || "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"
//   );

//   // const provider = new ethers.providers.JsonRpcProvider(process.env.NODE);

//   // Mock USDT
//   const contractAddress = "0x8C819De7999D903bD86D6B3bdf46c1E1a1D0F8A7";
//   const contract = new ethers.Contract(contractAddress, erc20, provider);
//   const result = await contract.balanceOf(OWNER);

//   res.json({ result });
// });

app.post("/faucet", async (req, res) => {
  const to = req.body.to;
  const amount = req.body.amount;

  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"
  ); // process.env.NODE

  // Mock USDT
  const address =
    req.body.address || "0xaF2929Ed6758B0bD9575e1F287b85953B08E50BC";
  const contract = new ethers.Contract(address, erc_20_abi.abi, provider);

  const private_key = process.env.FAUCET_PRIVATE_KEY;
  const wallet = new ethers.Wallet(private_key, provider);

  const ethTx = {
    to: address,
    value: ethers.utils.parseEther("0.1")
  }

  const tx2 = await wallet.sendTransaction(ethTx);

  const contractWithSigner = contract.connect(wallet);
  const tx = await contractWithSigner.transfer(to, amount);

  console.log(tx.hash);
  res.json({ tx: tx.hash });
});

app.listen(PORT, err => {
  if (err) console.log(err);

  if (use_redis) {
    redisClient = redis.createClient(
      process.env.REDIS_URL || "redis://localhost:6379"
    );
    // redisClient = redis.createClient("redis://192.168.1.20:6379");
  }

  console.log(`Server listening on PORT ${PORT}`);
});
