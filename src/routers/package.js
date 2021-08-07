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

	let result = validator.validate(pkg, packageSchema);
	if (result.errors.length != 0) {
		res.status(400);
		res.set('Content-Type', 'text/plain');
		res.write('Package does not comply with JSON schema:');
		for (const error of result.errors)
			res.write('\n- package' + error.stack.substr(8));
		res.end();
		return;
	}

	if(!spdxExpressionValidate(pkg.license)) {
		res.status(400);
		res.set('Content-Type', 'text/plain');
		res.send('License is not a valid SPDX expression.');
		return;
	}

	const scope = pkg.id.substr(0, pkg.id.indexOf('/'));
	let user = undefined;
	try {
		user = await github.checkAuthorization(req.get('Authorization'), scope);
	} catch (error) {
		res.status(error.status);
		res.set('Content-Type', 'text/plain');
		res.send(error.message);
		return;
	}

	// Past this point, {user} = undefined
	// only if auth has been skipped

	const filepath = path.normalize(path.join(config.dataPath,
			'/packages/', pkg.id + '.json'));
	
	let data = undefined;
	let oldManifest, newManifest;

	const now = new Date();
	if (await lock.acquire(filepath, async () => {
		// Returns today's oldest release date or undefined

		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {
			const scopeDir = path.normalize(path.join(config.dataPath,
				'/packages/', scope + '/'));

			if (user !== undefined && !config.admins.includes(user.login)
					&& (await fs.promises.readdir(scopeDir)).length >= config.maxPackagesPerScope) {
				res.status(503);
				res.set('Content-Type', 'text/plain');
				res.send(`Maximum number of packages (${config.maxPackagesPerScope}) has already been published in this scope.\n`
						+ 'You can delete one of your packages to free up the limit.\n'
						+ 'Or ask archive administration to create one for you.');
				return true;
			}
		}
		
		oldManifest = data === undefined ? {} : JSON.parse(data);
		newManifest = Object.assign({}, oldManifest);
		
		const nowStr = now.toISOString();

		if (data === undefined) {
			newManifest.created = nowStr;
			newManifest.releases = {};
			newManifest.views = {};
		}

		let oldestRecentReleaseDate = now;
		if (user !== undefined && !config.admins.includes(user.login)
				&& !Object.keys(newManifest.releases).includes(pkg.version)
				&& Object.values(newManifest.releases).reduce((count, release) => {
					const date = new Date(release.created);
					if (now - date < 24 * 60 * 60 * 1000) {
						if (date < oldestRecentReleaseDate)
						oldestRecentReleaseDate = date;
						return count + 1;
					}
					return count;
				}, 0) >= config.maxNewReleasesPerPackagePerDay) {
			const waitMillis = 24 * 60 * 60 * 1000 - (now - oldestRecentReleaseDate);
			const nextAvailableDate = new Date(oldestRecentReleaseDate);
			nextAvailableDate.setTime(oldestRecentReleaseDate.getTime() + waitMillis);
	
			res.status(503);
			res.set('Content-Type', 'text/plain');
			res.set('Retry-After', waitMillis / 1000);
			res.send(`Maximum number of daily releases (${config.maxNewReleasesPerPackagePerDay}) has been reached.\n`
					+ `Next release can be published on ${nextAvailableDate}.\n`
					+ 'You can delete one of your recent releases if waiting is not an option.\n'
					+ 'Or ask archive administration to create one for you.');
			return true;
		}

		newManifest.description = pkg.description;
		newManifest.git = pkg.git;
		newManifest.keywords = pkg.keywords;
		newManifest.license = pkg.license;
		newManifest.modified = nowStr;
		if (newManifest.releases[pkg.version] === undefined) {
			newManifest.releases[pkg.version] = {
				created: nowStr,
				dependencies: pkg.dependencies
			};
		} else
			newManifest.releases[pkg.version].dependencies = pkg.dependencies;
		
		await fs.promises.mkdir(path.dirname(filepath), {
			recursive: true
		});
		await fs.promises.writeFile(filepath, prettyStringifyJson(newManifest));

		return false;
	}))
		return;

	if (data === undefined) {
		const newKeywords = searchIndex.getKeywords([
			newManifest.description,
			pkg.id,
			newManifest.keywords.join()
		].join());
		for (let keyword of newKeywords)
			searchIndex.addMapping(keyword, pkg.id);

		res.status(201);
		res.set('Content-Type', 'text/plain');
		res.set('Location', new URL(
			'/package/' + pkg.id + '/',
			req.protocol + '://' + req.hostname +
			(config.trustProxy ? '' : ':' + process.env.PORT)
		).toString());
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
		res.set('Content-Type', 'text/plain');
		res.send(`Updated ${pkg.id}.`);
	}
});

router.get('/:scope/:name/', async (req, res, next) => {
	const id = req.params.scope + '/' + req.params.name;
	
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

router.delete('/:scope/:name/', deleteSlowDown, async (req, res, next) => {
	const id = req.params.scope + '/' + req.params.name;
	let filepath = path.normalize(path.join(config.dataPath, '/packages/', id + '.json'));

	try {
		await github.checkAuthorization(req.get('Authorization'), req.params.scope);
	} catch (error) {
		res.status(error.status);
		res.set('Content-Type', 'text/plain');
		res.send(error.message);
		return;
	}

	const message = await lock.acquire(filepath, async () => {
		let data;
		try {
			data = await fs.promises.readFile(filepath, 'utf-8');
		} catch {
			return undefined;
		}
		const manifest = JSON.parse(data);

		if (req.query.release === undefined) {
			// Update search index

			const query = [
				manifest.description,
				id,
				manifest.keywords.join()
			].join();

			for (let keyword of searchIndex.getKeywords(query))
				searchIndex.removeMapping(keyword, id);

			// Update top.json

			const topPath = path.normalize(path.join(config.dataPath, '/top.json'));
			await lock.acquire(topPath, async () => {
				try {
					let topPackages = JSON.parse(await fs.promises.readFile(topPath, 'utf-8'));

					let modified = false;
					topPackages = topPackages.filter(item => {
						if (item === id) {
							modified = true;
							return false;
						} else
							return true;
					});

					if (modified) {
						if (topPackages.length == 0)
							await fs.promises.rm(topPath);
						else
							await fs.promises.writeFile(topPath, prettyStringifyJson(topPackages));
					}
				} catch {}
			});

			await fs.promises.rm(filepath);
			return `Removed ${id}.`;
		}

		if (manifest.releases[req.query.release] === undefined) {
			res.status(400);
			return 'No such release.';
		}

		delete manifest.releases[req.query.release];
		await fs.promises.writeFile(filepath, prettyStringifyJson(manifest));

		return `Removed release ${req.query.release} of ${id}.`;
	});

	if (message === undefined) {
		next();
	} else {
		res.set('Content-Type', 'text/plain');
		res.send(message);
	}
});

export default router;
