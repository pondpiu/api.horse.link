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
    meeting.id = meet.venueMnemonic; //;
    meeting.name = meet.meetingName; //.toUpperCase();
    meeting.location = meet.location; //.toUpperCase();
    meeting.date = meet.meetingDate;
    meeting.races = meet.races.map(r => {
      const race = {};
      race.number = r.raceNumber;
      race.name = r.raceName.toUpperCase();
      race.start = r.raceStartTime;

      return race;
    });

    return meeting;
  });

  // for (let i = 0; i < meetings.length; i++) {
  //   const venueMnemonic = meetings[i].id;
  //   const races_config = {
  //     method: "get",
  //     url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${date}/meetings/R/${venueMnemonic}/races/?jurisdiction=NSW`,
  //     headers: {}
  //   };

  //   const races_response = await axios(races_config);
  //   for (let j = 0; j < 1; j++) {
  //     const race = {
  //       number: races_response[i]?.raceNumber,
  //       name: races_response[i]?.raceName,
  //       results: races_response[i]?.results
  //     }

  //     meetings.races.push(race);
  //   }
  // }

  return meetings;
};

app.get("/", (req, res) => {
  const today = getToday();
  const message = `Hello World ${today}`;
  const signature = sign(message);
  console.log(signature);
  res.send(`${message} ${signature.signature}`);
});

app.get("/vaults", async (req, res) => {
  // todo
});

//
app.get("/runners/:track/:race/win", async (req, res) => {
  const today = getToday();

  const track = req.params.track;
  const race = req.params.race;

  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-04-17/meetings/R/DBO/races/1?jurisdiction=QLD
  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-08-28/meetings/R/SSC/races/1?returnPromo=false&returnOffers=false&jurisdiction=QLD
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings/R/${track}/races/${race}?jurisdiction=QLD&returnPromo=false`,
    headers: {}
  };

  console.log(config);

  // bytes32 message = keccak256(abi.encodePacked(id, amount, odds, start, end));

  // no need to hash
  const market_id = `${today}-${track}-${race}-w`; // crypto.createHash("sha256").update(`${today}-${track}-${race}-w`).digest("hex");

  const result = await axios(config);
  const nonce = crypto.randomUUID();
  const close = 0;
  const end = 0;

  const runners = result.data.runners.map(item => {
    const odds = item.fixedOdds.returnWin * 1000;

    const runner = {};
    runner.nonce = nonce;
    runner.number = item.runnerNumber;
    runner.name = item.runnerName.toUpperCase();
    runner.market_id = market_id;
    runner.close = close;
    runner.end = end;
    runner.odds = odds; // todo: get precision from contract
    runner.proposition_id = `${today}-${track}-${race}-w${item.runnerNumber}`; // .digets("hex");
    
    runner.barrier = item.barrierNumber;

    runner.signature = sign(
      `${nonce}${item.runnerNumber}${market_id}${odds}${close}${end}`
    );

    return runner;
  });

  // const signature = sign(runners);

  const response = {
    owner: "0x155c21c846b68121ca59879B3CCB5194F5Ae115E",
    data: runners,
    signature: "", // signature.signature,
    hash: "", //signature.hash
  };

  res.json(response);
});

//
app.get("/meetings", async (req, res) => {
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = getToday();
    const result = await getMeetings(today);

    cache.put("meetings", result, 1000 * 60);
    // console.log(result);
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
    owner: "0x155c21c846b68121ca59879B3CCB5194F5Ae115E",
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
  // console.log(meetings);

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
    owner: "0xeC8bB1C25679A2A3B3a276a623Bbc0D9B50D5C2b",
    data: meetings_response,
    signature: signature.signature,
    hash: signature.hash
  };

  res.json(response);
});

app.post("/faucet", async (req, res) => {
  console.log(req.body);
  const to = req.body.to;
  const amount = req.body.amount;

  const abi = ["function transfer(uint256 amount, address to)"];
  const provider = new ethers.providers.JsonRpcProvider("https://eth-goerli.g.alchemy.com/v2/nj04KvcteO8qScoGLSYrz0p_tseWlb28"); //process.env.NODE

  // Mock USDT
  const contractAddress = "0xCB0B538b0D5a69a7649B834e2dB959F80fC746c2";
  const contract = new ethers.Contract(contractAddress, abi, provider);

  const privateKey = process.env.PRIVATE_KEY;
  const wallet = new ethers.Wallet(privateKey, provider);

  const contractWithSigner = contract.connect(wallet);
  const tx = await contractWithSigner.transfer(amount, to);

  console.log(tx.hash);
  res.json({ tx: tx.data });
});

app.listen(PORT, err => {
  if (err) console.log(err);
  console.log(`Server listening on PORT ${PORT}`);
});
