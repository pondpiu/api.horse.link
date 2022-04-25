require("dotenv").config();
const express = require("express");
const cors = require("cors");

const moment = require("moment");

const crypto = require("crypto");
const accounts = require("web3-eth-accounts");
const ethers = require("ethers");

const cache = require("memory-cache");
const axios = require("axios");
const uuid = require("uuid");

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

app.get("/", (req, res) => {
  const today = getToday();
  res.send(`Hello World ${today}`);
});

//
app.get("/odds/:track/:race/win", async (req, res) => {
  const today = getToday();

  // https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2022-04-17/meetings/R/DBO/races/1?jurisdiction=QLD
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings/R/${track}/races/${race}?jurisdiction=QLD&returnPromo=false`,
    headers: {}
  };

  // bytes32 message = keccak256(abi.encodePacked(id, amount, odds, start, end));
  const response = await axios(config);
  let odds = response.data.runners.map(item => {
    const runner = {};
    runner.id = uuid.v4();
    runner.number = item.runnerNumber;
    runner.start = 0;
    runner.end = 0;
    runner.odds = item.fixedOdds.returnWin * 100;
    runner.signature = crypto.Hash.sha256(JSON.stringify(runner)).toString(
      "hex"
    );
  });

  res.json(odds);
});

//
app.get("/meetings", async (req, res) => {
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = getToday();

    const config = {
      method: "get",
      url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${today}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
      headers: {}
    };

    const response = await axios(config);
    const meetings = response.data.meetings.map(item => {
      const meeting = {};
      meeting.id = item.venueMnemonic;
      meeting.name = item.meetingName;
      meeting.location = item.location;
      meeting.date = item.meetingDate;

      return meeting;
    });

    cache.put("meetings", meetings, 1000 * 60 * 60);
    console.log(meetings);
  }

  res.json(meetings);
});

//
app.get("/meetings/:date", async (req, res) => {
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${req.params.date}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`
  };

  const response = await axios(config);
  const meetings = response.data.meetings.map(item => item.meetingName);
  cache.put("meetings", meetings, 1000 * 60 * 60);
  console.log(meetings);

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    id: "",
    owner: "0xeC8bB1C25679A2A3B3a276a623Bbc0D9B50D5C2b",
    hash: "",
    signature: "",
    created: now,
    expires: "",
    meetings: cache.get("meetings")
  };

  const hash = crypto.createHash("sha256", meetings_response);
  meetings_response.hash = hash.digest("hex");

  // rally gas shield once will april foster fly direct frame actress tone
  const private_key = process.env.PRIVATE_KEY; // "0x29d6dec1a1698e7190a24c42d1a104d1d773eadf680d5d353cf15c3129aab729"; //
  // const account = new web3.eth.Account(private_key);
  console.log(private_key);
  const ethAccounts = new accounts();
  const signature = ethAccounts.sign(meetings_response, private_key);

  meetings_response.signature = signature.signature;
  meetings_response.hash = signature.messageHash;

  res.json(meetings_response);
});

app.post("/faucet", async (req, res) => {
  const to = req.body.to;
  const amount = req.body.amount;

  const abi = ["function transfer(uint256 amount, address to)"];

  const provider = ethers.getDefaultProvider();
  const contractAddress = "0x1Ab87d843E31248e0e094dc7444A40048ee01FB7";
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
  console.log("Server listening on PORT", PORT);
});
