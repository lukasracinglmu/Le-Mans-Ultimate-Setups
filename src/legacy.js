/* @file-notes: Die älteren Worker-Schichten, die noch nicht in der Routing-Tabelle stehen. */
// Routes without an entry in routes.js still pass these layers. They shrink with every
// feature that moves into the router (issue #10).
export { default } from './access-worker.js';
