import { initHeaderActions } from '../home/header-actions.js';
import { initOwnerNavEditor } from '../shared/owner-nav-editor.js';
import { initTicketBoard } from './board.js';

// Module scripts run after the document is parsed, so the board already exists.
initHeaderActions();
initOwnerNavEditor();
initTicketBoard();
