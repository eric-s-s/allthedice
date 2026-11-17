.PHONY: test cache-bust run-local-dev revert-local-dev

# opens a file in the default browser: xdg-open on Linux, open on macOS
OPEN := $(shell command -v xdg-open 2>/dev/null || echo open)

test: node_modules/.package-lock.json
	node --test tests/

# files that index.html links with ?v=<content hash>, so after a deploy browsers fetch the new
# copy instead of mixing a fresh page with stale cached scripts. tests/cachebust.test.js checks them.
ASSETS := styles.css scinum.js statsmaker.js roller.js plothelpers.js config.js interface.js

# set the ?v= of every asset in index.html to its current content hash. run after editing any of them.
cache-bust:
	for f in $(ASSETS); do \
		v=$$(sha256sum $$f | cut -c1-8); \
		sed -i -E "s#\"$$f(\?v=[0-9a-f]*)?\"#\"$$f?v=$$v\"#" index.html; \
	done

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
