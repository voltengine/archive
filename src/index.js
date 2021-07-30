import express from 'express';
import expressSlowDown from 'express-slow-down';

import authRouter from './routers/auth.js';
import packageRouter from './routers/package.js';
import publishRouter from './routers/publish.js';
import searchRouter from './routers/search.js';
import topRouter from './routers/top.js';
import config from './config.js';

(async function() {
	const server = express();

	// Allow 100 full-speed requests per
	// minute, then delay by 100 ms
	server.use(expressSlowDown(config.slowDown));

	server.use(express.json());

	server.use((err, req, res, next) => {
		res.status(err.status);
		res.send(err.message);
	});

	server.get('/', async (req, res) => {
		res.write('Available endpoints:\n');
		res.write('GET /auth/\n');
		res.write('GET /package/{scope}/{name}/\n');
		res.write('DELETE /package/{scope}/{name}/\n')
		res.write('POST /publish/?token={token}\n');
		res.write('GET /search/?query={query}\n');
		res.write('GET /top/');
		res.end();
	});

	server.use('/auth/', authRouter);
	server.use('/package/', packageRouter);
	server.use('/publish/', publishRouter);
	server.use('/search/', searchRouter);
	server.use('/top/', topRouter);

	server.use((req, res) => {
		res.status(404);
		res.send('Not found.');
	});

	const port = 
	await server.listen(process.env.PORT);
	console.log(`Listening on port ${process.env.PORT}.`);
})();
