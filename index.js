import express from "express";
const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.get("/about", (req, res) => {
  res.send("About Us");
});


app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
