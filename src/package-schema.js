export default {
	"type": "object",
	"additionalProperties": false,
	"properties": {
		"dependencies": {
			"type": "object",
			"additionalProperties": false,
			"maxProperties": 1024,
			"patternProperties": {
				"^(?!-)(?!.*--)[a-z\\d-]{1,39}(?<!-)\\/(?=[a-z])(?!.*--)[a-z\\d-]{1,64}(?<!-)$": {
					"type": "string",
					"pattern": "(?=^.{0,1024}$)^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"
				}
			}
		},
		"description": {
			"type": "string",
			"pattern": "^.{0,256}$"
		},
		"git": {
			"type": "string",
			"pattern": "(?=^.{0,2048}$)^(https?|ssh|git|file|ftp):\\/\\/([^:@\\/]+(:[^:@\\/]+)?@)?([^:@\\/]+(:\\d+)?)?((?!.*\\/\\/)\\/.*)?$"
		},
		"id": {
			"type": "string",
			"pattern": "^(?!-)(?!.*--)[a-z\\d-]{1,39}(?<!-)\\/(?=[a-z])(?!.*--)[a-z\\d-]{1,64}(?<!-)$"
		},
		"keywords": {
			"type": "array",
			"uniqueItems": true,
			"maxItems": 16,
			"items": {
				"type": "string",
				"pattern": "(?=^.{0,64}$)^(?!-)(?!.*--)[a-z\\d]{2,16}(-[a-z\\d]{2,16})*(?<!-)$"
			}
		},
		"license": {
			"type": "string",
			"pattern": "^.{0,1024}$"
		},
		"version": {
			"type": "string",
			"pattern": "(?=^.{0,1024}$)^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$"
		}
	},
	"required": [
		"dependencies",
		"description",
		"git",
		"id",
		"keywords",
		"license",
		"version"
	]
};
