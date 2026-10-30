export const $ = (id) => document.getElementById(id);

const HTML_ENTITIES = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

// For text inside innerHTML and quoted attribute values.
export function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}
