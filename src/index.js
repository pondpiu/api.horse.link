require("dotenv").config();
const express = require("express");
const moment = require("moment");

const crypto = require("crypto");
const web3 = require("web3");
const accounts = require("web3-eth-accounts");
const cache = require("memory-cache");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

//
app.get("/meetings", async (req, res) => {
  const config = {
    method: "get",
    url: "https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/2021-11-07/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false",
    headers: {},
  };

  const response = await axios(config);
  const meetings = response.data.meetings.map((item) => item.meetingName);
  cache.put("meetings", meetings, 1000 * 60 * 60);
  console.log(meetings);

  res.json(cache.get("meetings"));
});

//
app.get("/meetings/:date", async (req, res) => {
  const config = {
    method: "get",
    url: `https://api.beta.tab.com.au/v1/tab-info-service/racing/dates/${req.params.date}/meetings?jurisdiction=QLD&returnOffers=true&returnPromo=false`,
    headers: {},
  };

  const response = await axios(config);
  const meetings = response.data.meetings.map((item) => item.meetingName);
  cache.put("meetings", meetings, 1000 * 60 * 60);
  console.log(meetings);

  const now = moment().unix();

  // https://eips.ethereum.org/EIPS/eip-191
  const meetings_response = {
    owner: "",
    hash_256: "",
    hash: "",
    signature: "",
    created: now,
    meetings: cache.get("meetings"),
  };

  const hash = crypto.createHash("sha256", meetings_response);
  meetings_response.hash_256 = hash.digest("hex");

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
