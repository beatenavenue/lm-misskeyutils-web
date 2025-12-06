const path = require("path");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;
const docsPath = path.join(__dirname, "../docs");

app.use(express.static(docsPath));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Dev server running at http://localhost:${port}/`);
});

