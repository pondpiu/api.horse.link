require("dotenv").config();
const express = require("express");
const cors = require("cors");

const moment = require("moment");

const crypto = require("crypto");
const accounts = require("web3-eth-accounts");
const ethers = require("ethers");

const cache = require("memory-cache");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const OWNER = process.env.OWNER || "0x155c21c846b68121ca59879B3CCB5194F5Ae115E";

const sign = payload => {
  // rally gas shield once will april foster fly direct frame actress tone
  const private_key =
    process.env.PRIVATE_KEY ||
    "0x22e5afcae8c823e7de74db1bf38684f56b7290c8a107473d4f3f8a967fd52eed";
  const ethAccounts = new accounts();
  const signature = ethAccounts.sign(payload, private_key);

  return signature;
};

const getToday = () => {
  const today = new Date().toLocaleString("en-US", {
    timeZone: "Australia/Brisbane"
  });
  moment.suppressDeprecationWarnings = true;
  return moment(today).format("YYYY-MM-DD");
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
      race.start_unix = start.unix()
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
  const today = getToday();
  const message = `Hello World ${today}`;
  const signature = sign(message);
  res.send(`${message} ${signature.signature}`);
});

app.get("/vaults", async (req, res) => {
  // todo:  query repsoitory contracts
});

//
app.get("/runners/:track/:race/win", async (req, res) => {
  const today = getToday();

  const track = req.params.track;
  const race = req.params.race;

  const market_id = `${today}-${track}-${race}-w`;
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

    // bytes32 message = keccak256(abi.encodePacked(id, amount, odds, start, end));

    const result = await axios(config);
    console.log(config.url);

    const nonce = crypto.randomUUID();
    const close = 0;
    const end = 0;

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
      runner.proposition_id = `${market_id}${item.runnerNumber}`; // .digets("hex");

      runner.barrier = item.barrierNumber;

      runner.signature = sign(
        `${nonce}-${market_id}${item.runnerNumber}-${odds}-${close}-${end}`
      );

      return runner;
    });

    cache.put(market_id, runners, 1000 * 60 * 60);
  //}

  // const signature = sign(runners);

  const runners_response = {
    owner: OWNER,
    data: runners,
    signature: "", // signature.signature,
    hash: "" //signature.hash
  };

  res.json(runners_response);
});

//
app.get("/meetings", async (req, res) => {
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = getToday();
    const result = await getMeetings(today);

    cache.put("meetings", result, 1000 * 60);
  }

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    nonce: crypto.randomUUID(),
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
    nonce: crypto.randomUUID(),
    created: now,
    expires: now + 60 * 1000,
    meetings: cache.get("meetings")
  };

  // const hash = crypto.createHash("sha256", meetings_response);
  // meetings_response.hash = hash.digest("hex");

  const signature = sign(meetings_response);

  const response = {
    owner: OWNER,
    data: meetings_response,
    signature: signature.signature,
    hash: signature.hash
  };

  res.json(response);
});

app.get("/faucet", async (req, res) => {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"
  );

  // const provider = new ethers.providers.JsonRpcProvider(process.env.NODE);

  // Mock USDT
  const contractAddress = "0x8C819De7999D903bD86D6B3bdf46c1E1a1D0F8A7";
  const contract = new ethers.Contract(contractAddress, erc20, provider);
  const result = await contract.balanceOf(OWNER);

  res.json({ result });
});

app.post("/faucet", async (req, res) => {
  console.log(req.body);
  const to = req.body.to;
  const amount = req.body.amount;

  const abi = ["function transfer(address to, uint256 amount)"];
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"
  ); //process.env.NODE

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
