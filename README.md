# Archive

📁 Volt package repository.

## Getting Started

### Setup

📝 Create following `./.env` file:

```
PORT={http-port}
GITHUB_CLIENT_SECRET={oauth-app-secret}
```

If PORT remains unspecified, server defaults to `80`. 

⚙️ Modify `./src/config.js` as you fancy. Remember to set matching GitHub client ID.

💻 Install Node.js dependencies:

```
npm install
```

### Running

For testing:
```
npm test
```

For deployment:
```
npm start
```

## About

### Authors

- Ray Ferric (**[rayferric](https://github.com/rayferric)**)

### License

This project is licensed under the MIT License. See the **[LICENSE](LICENSE)** file for details.