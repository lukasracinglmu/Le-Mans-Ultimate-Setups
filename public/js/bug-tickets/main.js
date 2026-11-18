import { initTicketBoard } from './board.js';
import { initOwnerNavigation } from '../shared/owner-navigation.js';

// Module scripts run after the document is parsed, so the board already exists.
initOwnerNavigation();
initTicketBoard();
