require("dotenv").config();
const express = require("express");
const cors = require("cors");

const moment = require("moment");

const crypto = require("crypto");
const web3 = require("web3");
const accounts = require("web3-eth-accounts");
const cache = require("memory-cache");
const axios = require("axios");
const uuid = require("uuid");

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// 
app.get("/odds/EAG/:race", (req, res) => {
  const token = uuid.v4();

  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${_today}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
    headers: {},
  };

  const response = await axios(config);
});

//
app.get("/meetings", async (req, res) => { 
  const meetings = await cache.get("meetings");
  if (!meetings) {
    const today = new Date();
    const _today = today.toISOString().split("T")[0];

    const config = {
      method: "get",
      url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${_today}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
      headers: {},
    };
  
    const response = await axios(config);
    const meetings = response.data.meetings.map((item) => {
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
  const meetings = response.data.meetings.map((item) => item.meetingName);
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
    meetings: cache.get("meetings"),
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

app.listen(PORT, (err) => {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
