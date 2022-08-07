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
app.use(cors());
const PORT = process.env.PORT || 3000;

const getToday = () => {
  const today = new Date().toLocaleString("en-US", {
    timeZone: "Australia/Brisbane"
  });
  moment.suppressDeprecationWarnings = true;
  return moment(today).format("YYYY-MM-DD");
};

const getMeetings = async (date) => {
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${date}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
    headers: {}
  };

  const response = await axios(config);

  const meetings = response.data.meetings.map(item => {
    const meeting = {};
    meeting.id = item.venueMnemonict; //;
    meeting.name = item.meetingName; //.toUpperCase();
    meeting.location = item.location; //.toUpperCase();
    meeting.date = item.meetingDate;

    return meeting;
  });

  return meetings;
};

const sign = (payload) => {
  // rally gas shield once will april foster fly direct frame actress tone
  const private_key = process.env.PRIVATE_KEY; // "0x29d6dec1a1698e7190a24c42d1a104d1d773eadf680d5d353cf15c3129aab729"; //
  const ethAccounts = new accounts();
  const signature = ethAccounts.sign(payload, private_key);

  return signature;
}

app.get("/", (req, res) => {
  const today = getToday();
  res.send(`Hello World ${today}`);
});

app.get("/vaults", async (req, res) => {
  // todo
});

//
app.get("/odds/:track/:race/win", async (req, res) => {
  const today = getToday();

  const track = req.params.track;
  const race = req.params.race;

  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-04-17/meetings/R/DBO/races/1?jurisdiction=QLD
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings/R/${track}/races/${race}?jurisdiction=QLD&returnPromo=false`,
    headers: {}
  };

  console.log(config);

  // bytes32 message = keccak256(abi.encodePacked(id, amount, odds, start, end));

  // no need to hash
  const market_id = `{$today}-${track}-${race}`; // crypto.createHash("sha256").update(`${today}-${track}-${race}-w`).digest("hex");

  const result = await axios(config);
  let response = {};

  let odds = result.data.runners.map(item => {
    const runner = {};
    runner.id = item.runnerNumber;
    runner.nonce = crypto.randomUUID();
    runner.market_id = market_id;
    runner.start = 0;
    runner.end = 0;
    runner.odds = item.fixedOdds.returnWin * 100;
    runner.proposition_id = item.runnerNumber; //crypto.createHash("sha256").update(`${today}-${track}-${race}-w${item.runnerNumber}`).digets("hex");
    // runner.signature = sign(runner);

    return runner;
  });

  response.odds = odds;

  res.json(response);
});

//
app.get("/meetings", async (req, res) => {
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = getToday();
    const result = await getMeetings(today);

    cache.put("meetings", result, 1000 * 60);
    console.log(result);
  }

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const response = {
    id: crypto.randomUUID(),
    owner: "0x155c21c846b68121ca59879B3CCB5194F5Ae115E",
    created: now,
    expires: now + 60 * 1000,
    meetings: cache.get("meetings")
  };

  res.json(response);
});

//
app.get("/meetings/:date", async (req, res) => {
  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-05-14/meetings?jurisdiction=QLD

  const meetings = getMeetings(req.params.date);

  cache.put("meetings", meetings, 1000 * 60 * 60);
  console.log(meetings);

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    id: crypto.randomUUID(),
    owner: "0xeC8bB1C25679A2A3B3a276a623Bbc0D9B50D5C2b",
    created: now,
    expires: now + 60 * 1000,
    meetings: cache.get("meetings")
  };

  // const hash = crypto.createHash("sha256", meetings_response);
  // meetings_response.hash = hash.digest("hex");

  const signature = sign(meetings_response);

  const response = {
    data : meetings_response,
    signature: signature.signature,
    hash: signature.hash
  };

  res.json(response);
});

app.post("/faucet", async (req, res) => {
  const to = req.body.to;
  const amount = req.body.amount;

  const abi = ["function transfer(uint256 amount, address to)"];

  const provider = ethers.getDefaultProvider();

  // Mock USDT
  const contractAddress = "0x7bE6C2E9ed27143683EB92b569861aFB559C5a041";
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const privateKey = process.env.PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);

  const contractWithSigner = contract.connect(wallet);
  const tx = await contractWithSigner.transfer(amount, to);

  console.log(tx.hash);
  res.json({ tx: tx.hash });
});

app.listen(PORT, err => {
  if (err) console.log(err);
  console.log(`Server listening on PORT ${PORT}`);
});
