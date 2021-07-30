import express from 'express';
import expressSlowDown from 'express-slow-down';
import fs from 'fs';
import path from 'path';

import * as github from '../util/github.js';
import lock from '../util/lock.js';
import prettyStringifyJson from '../util/pretty-stringify-json.js';
import * as searchIndex from '../util/search-index.js';
import config from '../config.js';

const router = express.Router();
const deleteSlowDown = expressSlowDown(config.deleteSlowDown);

router.get('/*/*/', async (req, res, next) => {
	const id = req.params[0] + '/' + req.params[1];
	let filepath = path.normalize(path.join(config.dataPath, '/packages/', id + '.json'));
	let totalViews = 1;

	if (await lock.acquire(filepath, async () => {
		// Returns true if server should continue to next route

		let data;
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {
			return true;
		}

		let manifest = JSON.parse(data);

		res.set('Content-Type', 'application/json');
		res.send(data);

		// Increment views and save updated manifest

		let todayStr = new Date().toISOString();
		todayStr = todayStr.substr(0, todayStr.indexOf('T'));
		const today = new Date(todayStr);

		// Clean up dates over a week old
		for (const oldDateStr in manifest.views) {
			const oldDate = new Date(oldDateStr);
			if (today - oldDate > 7 * 24 * 60 * 60 * 1000)
				delete manifest.views[oldDateStr];
			else
				totalViews += manifest.views[oldDateStr];
		}

		// Increment today's counter
		if (!manifest.views[todayStr])
			manifest.views[todayStr] = 1;
		else
			manifest.views[todayStr]++;

		data = prettyStringifyJson(manifest);

		await fs.promises.writeFile(filepath, data);
		return false;
	})) {
		next();
		return;
	}

	// Update top.json

	filepath = path.normalize(path.join(config.dataPath, '/top.json'));
	await lock.acquire(filepath, async () => {
		// Read top packages and remove current package from the list
		let topPackages
		try {
			topPackages = JSON.parse(await fs.promises.readFile(filepath, 'utf-8'));
			topPackages = topPackages.filter(item => item !== id);
		} catch {
			topPackages = []
		}
		
		// Compute current view count for all packages on the list
		const viewCounts = await topPackages.reduce(async (viewCounts, competitorId) => {
			let data;
			try {
				const packagePath = path.normalize(path.join(config.dataPath,
						'/packages/', competitorId + '.json'));
				await lock.acquire(packagePath, async () => {
					data = await fs.promises.readFile(packagePath, 'utf-8');
				});

				const viewCount = Object.values(JSON.parse(data).views)
					.reduce((sum, value) => sum + value);
				viewCounts[competitorId] = viewCount;
			} catch {}

			return viewCounts;
		}, {});
		viewCounts[id] = totalViews;

		let sortedNames = Object.keys(viewCounts).sort(
				(id1, id2) => viewCounts[id2] - viewCounts[id1]);
		sortedNames = sortedNames.slice(0, 10);

		await fs.promises.mkdir(path.dirname(filepath), {
			recursive: true
		});
		await fs.promises.writeFile(filepath, prettyStringifyJson(sortedNames));
	});
});

router.delete('/*/*/', deleteSlowDown, async (req, res, next) => {
	const scope = req.params[0];
	const id = scope + '/' + req.params[1];
	let filepath = path.normalize(path.join(config.dataPath, '/packages/', id + '.json'));

	const error = await github.checkAuthorization(req.query.token, scope);
	if (error !== undefined) {
		res.status(error.status);
		res.send(error.message);
		return;
	}

	let data = undefined;
	await lock.acquire(filepath, async () => {
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {}
	})
	if (data === undefined)
		next();
	else {
		const manifest = JSON.parse(data);

		const query = [
			manifest.description,
			id,
			manifest.keywords.join()
		].join();

		for (let keyword of searchIndex.getKeywords(query)) {
			searchIndex.removeMapping(keyword, id);
		}

		await fs.promises.rm(filepath);
		res.send(`Removed ${id}.`);
	}
});

export default router;
