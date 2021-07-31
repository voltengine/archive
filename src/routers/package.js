import express from 'express';
import expressSlowDown from 'express-slow-down';
import fs from 'fs';
import jsonschema from 'jsonschema';
import path from 'path';
import spdxExpressionValidate from 'spdx-expression-validate';

import * as github from '../util/github.js';
import lock from '../util/lock.js';
import prettyStringifyJson from '../util/pretty-stringify-json.js';
import * as searchIndex from '../util/search-index.js';
import config from '../config.js';
import packageSchema from '../package-schema.js';

const router = express.Router();
const validator = new jsonschema.Validator();
const publishSlowDown = expressSlowDown(config.slowDown.publish);
const deleteSlowDown = expressSlowDown(config.slowDown.delete);

// Map IDs to pending view count change,
// each entry has an ongoing timer
const viewsToSync = {};

async function syncViews(id) {
	let filepath = path.normalize(path.join(config.dataPath, '/packages/', id + '.json'));
	let totalViews = 1;

	let todayStr = new Date().toISOString();
	todayStr = todayStr.substr(0, todayStr.indexOf('T'));
	const today = new Date(todayStr);

	// Update manifest

	await lock.acquire(filepath, async () => {
		let manifest = JSON.parse(await fs.promises.readFile(filepath, 'utf-8'));

		// Clean up dates over a week old
		for (const oldDateStr in manifest.views) {
			const oldDate = new Date(oldDateStr);
			if (today - oldDate > config.viewCountKeepPeriod * 24 * 60 * 60 * 1000)
				delete manifest.views[oldDateStr];
			else
				totalViews += manifest.views[oldDateStr];
		}

		// Add pending views
		if (manifest.views[todayStr] === undefined)
			manifest.views[todayStr] = viewsToSync[id];
		else
			manifest.views[todayStr] += viewsToSync[id];
		delete viewsToSync[id];

		await fs.promises.writeFile(filepath, prettyStringifyJson(manifest));
	});

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

				const views = JSON.parse(data).views;
				const viewCount = Object.keys(views)
					.filter(date => today - date < config.viewCountKeepPeriod * 24 * 60 * 60 * 1000)
					.reduce((sum, key) => sum + views[key]);
				viewCounts[competitorId] = viewCount;
			} catch {}

			return viewCounts;
		}, {});
		viewCounts[id] = totalViews;

		let sortedNames = Object.keys(viewCounts).sort(
				(id1, id2) => viewCounts[id2] - viewCounts[id1]);
		sortedNames = sortedNames.slice(0, config.maxTopPackagesCount);

		await fs.promises.mkdir(path.dirname(filepath), {
			recursive: true
		});
		await fs.promises.writeFile(filepath, prettyStringifyJson(sortedNames));
	});
}

router.post('/', publishSlowDown, async (req, res) => {
	const pkg = req.body;
	const result = validator.validate(pkg, packageSchema);

	if (result.errors.length != 0) {
		res.status(400);
		res.write('Package does not comply with JSON schema:');
		for (const error of result.errors)
			res.write('\n- package' + error.stack.substr(8));
		res.end();
		return;
	}

	if(!spdxExpressionValidate(pkg.license)) {
		res.status(400);
		res.send('License is not a valid SPDX expression.');
		return;
	}

	const scope = pkg.id.substr(0, pkg.id.indexOf('/'));
	const error = await github.checkAuthorization(req.query.token, scope);
	if (error !== undefined) {
		res.status(error.status);
		res.send(error.message);
		return;
	}

	const filepath = path.normalize(path.join(config.dataPath,
			'/packages/', pkg.id + '.json'));
	
	let data = undefined;
	let oldManifest, newManifest;
	await lock.acquire(filepath, async () => {
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {}
		
		oldManifest = data === undefined ? {} : JSON.parse(data);
		newManifest = Object.assign({}, oldManifest);

		const today = new Date().toISOString();

		if (data === undefined) {
			newManifest.created = today;
			newManifest.releases = {};
			newManifest.views = {};
		}

		newManifest.description = pkg.description;
		newManifest.git = pkg.git;
		newManifest.keywords = pkg.keywords;
		newManifest.license = pkg.license;
		newManifest.modified = today;
		newManifest.releases[pkg.version] = pkg.dependencies === undefined ? {} : pkg.dependencies;
		
		await fs.promises.mkdir(path.dirname(filepath), {
			recursive: true
		});
		await fs.promises.writeFile(filepath, prettyStringifyJson(newManifest));
	});

	if (data === undefined) {
		const newKeywords = searchIndex.getKeywords([
			newManifest.description,
			pkg.id,
			newManifest.keywords.join()
		].join());
		for (let keyword of newKeywords)
			searchIndex.addMapping(keyword, pkg.id);

		res.set('Location', new URL(
			'/package/' + pkg.id + '/',
			req.protocol + '://' + req.hostname +
			(config.trustProxy ? '' : ':' + process.env.PORT)
		).toString());
		res.status(201);
		res.send(`Created ${pkg.id}.`);
	} else {
		// ID cannot change
		const oldKeywords = searchIndex.getKeywords([
			oldManifest.description,
			oldManifest.keywords.join()
		].join());
		const newKeywords = searchIndex.getKeywords([
			newManifest.description,
			newManifest.keywords.join()
		].join());

		const removedKeywords = oldKeywords.filter(keyword => !newKeywords.includes(keyword));
		const addedKeywords = newKeywords.filter(keyword => !oldKeywords.includes(keyword));

		for (let keyword of removedKeywords)
			searchIndex.removeMapping(keyword, pkg.id);
		for (let keyword of addedKeywords)
			searchIndex.addMapping(keyword, pkg.id);

		res.status(200);
		res.send(`Updated ${pkg.id}.`);
	}
});

router.get('/*/*/', async (req, res, next) => {
	const id = req.params[0] + '/' + req.params[1];
	let filepath = path.normalize(path.join(config.dataPath, '/packages/', id + '.json'));

	let data;
	try {
		await lock.acquire(filepath, async () => {
			// Returns true if server should continue to next route
			data = await fs.promises.readFile(filepath, 'utf-8');
		});
	} catch {
		next();
		return;
	}

	if (viewsToSync[id] === undefined) {
		viewsToSync[id] = 1;
		setTimeout(syncViews, config.viewCountSyncDelay, id);
	} else
		viewsToSync[id]++;

	res.set('Content-Type', 'application/json');
	res.send(data);
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
