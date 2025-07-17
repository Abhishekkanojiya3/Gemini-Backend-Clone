import "./workers/geminiWorker.js";
import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Worker is running (with dummy server).');
});

app.listen(PORT, () => {
  console.log(`Dummy server running on port ${PORT}`);
});
