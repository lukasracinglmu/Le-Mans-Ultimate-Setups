import { initHeaderActions } from '../home/header-actions.js';
import { initOwnerNavEditor } from '../shared/owner-nav-editor.js';
import { initRequestForm } from './form.js';

// Module scripts run after the document is parsed, so the form already exists.
initHeaderActions();
initOwnerNavEditor();
initRequestForm();
