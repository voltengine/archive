import express from 'express';
import fs from 'fs';
import path from 'path';

import config from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
	const filepath = path.join(config.dataPath, '/top.json');
	res.set('Content-Type', 'application/json');
	res.send(await fs.promises.readFile(filepath, 'utf-8'));
});

export default router;
