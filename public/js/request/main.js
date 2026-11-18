import { initRequestForm } from './form.js';
import { initOwnerNavigation } from '../shared/owner-navigation.js';

// Module scripts run after the document is parsed, so the form already exists.
initOwnerNavigation();
initRequestForm();
