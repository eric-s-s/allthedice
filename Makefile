.PHONY: test run-local-dev revert-local-dev

# opens a file in the default browser: xdg-open on Linux, open on macOS
OPEN := $(shell command -v xdg-open 2>/dev/null || echo open)

test: node_modules/.package-lock.json
	node --test tests/

node_modules/.package-lock.json: package-lock.json
	npm ci

# switch config.js to the local dev server (localhost:8000) and open the page.
# the browser is started in the background so the terminal is free right away.
run-local-dev:
	sed -i -E \
		-e "s#^([[:space:]]*)//[[:space:]]*(return 'http://localhost)#\1\2#" \
		-e "s#^([[:space:]]*)(return 'https://[^']*execute-api)#\1//\2#" \
		config.js
	nohup $(OPEN) index.html >/dev/null 2>&1 &

# switch config.js back to the production lambda
revert-local-dev:
	sed -i -E \
		-e "s#^([[:space:]]*)(return 'http://localhost)#\1//\2#" \
		-e "s#^([[:space:]]*)//[[:space:]]*(return 'https://[^']*execute-api)#\1\2#" \
		config.js
