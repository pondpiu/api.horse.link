const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// 
app.get("/", (req, res) => {
  res.json({ user: "giddy up" });
});

app.listen(PORT, (err)  => {
  if (err) console.log(err);
  console.log("Server listening on PORT", PORT);
});
