// Custom Cypress commands for the toppages suite.
//
// Most of what these specs need already ships with @jahia/cypress (cy.login, cy.logout,
// cy.apollo and the JCR helpers), and it is registered by registerSupport() in e2e.js.
// Module-specific helpers live in cypress/support/toppages.ts as plain functions rather
// than as commands, so their types survive.
//
// https://on.cypress.io/custom-commands

import 'cypress-wait-until';
