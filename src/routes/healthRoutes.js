const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ success: true, uptime: process.uptime(), timestamp: Date.now() });
});

module.exports = router;
