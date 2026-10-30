/* @file-notes: Der ältere Worker für die Routen, die noch nicht in der Routing-Tabelle stehen. */
// Routes without an entry in routes.js still go to worker.js. It shrinks with every
// feature that moves into the router (issue #10).
export { default } from './worker.js';
