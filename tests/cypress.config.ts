import {defineConfig} from 'cypress';
import fs from 'fs';

export default defineConfig({
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
        configFile: 'reporter-config.json'
    },
    screenshotsFolder: './results/screenshots',
    video: true, // In Cypress, videos are disabled by default
    videosFolder: './results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    watchForFileChanges: false,
    defaultCommandTimeout: 30000,
    e2e: {
        setupNodeEvents(on, config) {
            // Delete videos for tests that did not fail
            on('after:spec', (spec: Cypress.Spec, results: CypressCommandLine.RunResult) => {
                if (results && results.video) {
                    // Do we have failures for any retry attempts?
                    const failures = results.tests.some(test =>
                        test.attempts.some(attempt => attempt.state === 'failed')
                    );
                    if (!failures) {
                        // Delete the video if the spec passed and no tests retried
                        fs.unlinkSync(results.video);
                    }
                }
            });
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('./cypress/plugins/index.js')(on, config);
        },
        excludeSpecPattern: '*.ignore.ts',
        baseUrl: 'http://localhost:8080'
    },
    env: {
        // Digitall is the only site the specs provision, so every spec is scoped to it.
        SITE_KEY: 'digitall',
        LANGUAGE: 'en',
        // Base URL of the static AWStats fixture, as resolved FROM THE JAHIA CONTAINER.
        // Cypress never fetches it -- it only writes the value into the module's site
        // configuration, and Jahia's JVM is what performs the HTTP GET. That is why this
        // stays a docker-network hostname even when Cypress runs on the host.
        AWSTATS_BASE_URL: process.env.AWSTATS_BASE_URL || 'http://awstats'
    }
});
