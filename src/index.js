const express = require("express");
const cache = require("memory-cache");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

const getName = (item) => {
  return [item.firstname, item.lastname].join(" ");
};

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

  res.json(cache.get("meetings"));
});

app.listen(PORT, (err) => {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
