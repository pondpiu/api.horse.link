require("dotenv").config();
const express = require("express");
const cors = require("cors");

const moment = require("moment");

const crypto = require("crypto");
const accounts = require("web3-eth-accounts");
const ethers = require("ethers");

const cache = require("memory-cache");
const axios = require("axios");

const market_abi = require("../abis/Market.json");
const registry_abi = require("../abis/Registry.json");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const OWNER = process.env.OWNER || "0x155c21c846b68121ca59879B3CCB5194F5Ae115E";

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
  // rally gas shield once will april foster fly direct frame actress tone
  const private_key =
    process.env.PRIVATE_KEY ||
    "0x22e5afcae8c823e7de74db1bf38684f56b7290c8a107473d4f3f8a967fd52eed";
  const ethAccounts = new accounts();
  const signature = ethAccounts.sign(payload, private_key);

  return signature;
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

const getMarkets = async (provider) => {
  const contractAddress = "0x5Df377d600A40fB6723e4Bf10FD5ee70e93578da";
  const contract = new ethers.Contract(contractAddress, registry_abi.abi, provider);

  const count = await contract.marketCount();
  const markets = [];

  for (let i = 0; i < Number(count) - 1; i++) {
    const market = await contract.markets(i);
    markets.push(market);
  }

  return markets;
};

app.get("/markets", async (req, res) => {
  const cached_markets = await cache.get("markets");
  if (cached_markets) {
    res.send(cached_markets);
    return;
  }

  const response = await getMarkets(getProvider());

  await cache.put("markets", response, 60 * 60 * 24);

  res.send(response);
  res.end();
});

const getVaults = async (provider) => {
  const contractAddress = "0x5Df377d600A40fB6723e4Bf10FD5ee70e93578da";
  const contract = new ethers.Contract(contractAddress, registry_abi.abi, provider);

  const count = await contract.vaultCount();
  const vaults = [];

  for (let i = 0; i < Number(count) - 1; i++) {
    const vault = await contract.vaults(i);
    vaults.push(vault);
  }

  return vaults;
};

app.get("/vaults", async (req, res) => {
  const cached_vaults = await cache.get("vaults");
  if (cached_vaults) {
    res.send(cached_vaults);
    return;
  }

  const response = await getVaults(getProvider());
  await cache.put("vaults", response, 60 * 60 * 24);

  res.send(response);
  res.end();
});

//
app.get("/runners/:track/:race/win", async (req, res) => {
  const today = getToday("YYYY-MM-DD");

  const track = req.params.track;
  const race = req.params.race;

  const market_id = `${today}_${track}_${race}_W`;
  const cached_runners = await cache.get(market_id);
  let runners;

  // if (!cached_runners) {
  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-04-17/meetings/R/DBO/races/1?jurisdiction=QLD
  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-08-28/meetings/R/SSC/races/1?returnPromo=false&returnOffers=false&jurisdiction=QLD

  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings/R/${track}/races/${race}?jurisdiction=QLD&returnPromo=false`,
    headers: {}
  };

  const result = await axios(config);
  console.log(config.url);

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
    runner.proposition_id_hash = ethers.utils.keccak256(
      ethers.utils.toUtf8Bytes(`${market_id}${item.runnerNumber}`)
    );

    runner.barrier = item.barrierNumber;

    runner.signature = sign(
      `${nonce}-${market_id}${item.runnerNumber}-${odds}-${close}-${end}`
    );

    return runner;
  });

  const sumOfOdds = runners.reduce((a, b) => a + b.odds, 0);

  cache.put(market_id, runners, 1000 * 60 * 60);
  //}

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
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = getToday("YYYY-MM-DD");
    const result = await getMeetings(today);

    cache.put("meetings", result, 1000 * 60);
  }

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    nonce: getNonce(),
    created: now,
    expires: now + 60 * 1000,
    meetings: cache.get("meetings")
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

  const meetings = getMeetings(req.params.date);
  cache.put("meetings", meetings, 1000 * 60 * 60);

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    nonce: getNonce(),
    created: now,
    expires: now + 60 * 1000,
    meetings: cache.get("meetings")
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
  const contract = new ethers.Contract(contractAddress, market_abi.abi, getProvider());

  const odds = ethers.BigNumber.from(req.query.odds);
  const wager = ethers.BigNumber.from(req.query.wager);
  const proposition_id = req.query.proposition_id_hash;

  const result = await contract.getOdds(odds, wager, proposition_id);

  res.json({ result });
});

app.get("/history", async (req, res) => {
  const provider = getProvider();
  let markets = await cache.get("markets");
  if (!markets) {
    markets = await getMarkets(provider);
    await cache.put("markets", markets, 60 * 60 * 24);
  }

  const results = [];

  for (let i = 0; i < markets.length; i++) {
    const market = new ethers.Contract(markets[i], market_abi.abi, provider);

    // const market = await ethers.getContractAt("Market", contractAddress);
    const placedFilter = await market.filters.Placed();
    const placedLogs = await market.queryFilter(placedFilter);

    console.log(placedLogs[0]);
    // console.log(placedLogs[0].args);

    const signature = sign("1");

    results.push({ index: 1, market_id: "1", proposition_id: placedLogs[0].args[0], punter: placedLogs[0].args[3], amount: placedLogs.amount, tx: placedLogs[0].transactionHash, market: markets[i], signature: signature.signature});
  }

  // event Placed(bytes32 propositionId, uint256 amount, uint256 payout, address indexed owner);
  // const redemptionEvents = await vm.queryFilter(redemptionFilter, fromBlock, toBlock);


  res.json({ results });
});

app.get("/history/:account", async (req, res) => {
  const results = [{ market_id: "1", proposition_id: "1", punter: "0x00", amount: 100, odds: 2.0, result: "win", tx: "0x00" }];

  res.json({ results });
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
  console.log(req.body);
  const to = req.body.to;
  const amount = req.body.amount;

  const abi = ["function transfer(address to, uint256 amount)"];
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"
  ); // process.env.NODE

  // Mock USDT
  const contractAddress = "0x8C819De7999D903bD86D6B3bdf46c1E1a1D0F8A7";
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const privateKey = process.env.PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);

  const contractWithSigner = contract.connect(wallet);
  const tx = await contractWithSigner.transfer(to, amount);

  console.log(tx.hash);
  res.json({ tx: tx.data });
});

app.listen(PORT, err => {
  if (err) console.log(err);
  console.log(`Server listening on PORT ${PORT}`);
});
