process.env.PORT = process.env.PORT || 80;

import express from 'express';
import expressSlowDown from 'express-slow-down';

import authRouter from './routers/auth.js';
import packageRouter from './routers/package.js';
import searchRouter from './routers/search.js';
import topRouter from './routers/top.js';
import lock from './util/lock.js';
import config from './config.js';

const app = express();

app.set('trust proxy', config.trustProxy);

app.use(expressSlowDown(config.slowDown.common));

app.use(express.json());

app.use((err, req, res, next) => {
	res.status(err.status);
	res.send(err.message);
});

app.get('/', async (req, res) => {
	res.write('Available endpoints:\n');
	res.write('GET /auth/\n');
	res.write('POST /package/?token={token}\n');
	res.write('GET /package/{scope}/{name}/\n');
	res.write('DELETE /package/{scope}/{name}/?token={token}\n')
	res.write('GET /search/?query={query}\n');
	res.write('GET /top/');
	res.end();
});

app.use('/auth/', authRouter);
app.use('/package/', packageRouter);
app.use('/search/', searchRouter);
app.use('/top/', topRouter);

app.use((req, res) => {
	res.status(404);
	res.send('Not found.');
});

const server = app.listen(process.env.PORT, () => {
	console.log(`Listening on port ${process.env.PORT}.`);
});

function terminate() {
	// We're short of time, most
	// systems force quit after 1 second

	// Wait for requests
	server.close(() => {
		console.log('Server closed.');

		// Wait for cirtical sections
		const wait = () => {
			if (lock.isBusy())
				setTimeout(wait, 100);
			else {
				console.log('Critical sections halted.');
				process.exit(0);
			}
		}
		wait();
	});
}

// Windows might force quit immediately on SIGINT
process.on('SIGTERM', terminate);
process.on('SIGINT', terminate);
