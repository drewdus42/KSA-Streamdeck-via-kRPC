/**
 * Draws key faces as SVG.
 *
 * A key face is described by `spec`, which keeps the layout rules in one place and
 * testable, and `image` turns that description into an SVG data URI for setImage.
 * SVG keeps the plugin free of a canvas dependency and stays sharp at every key
 * size, and the rendered images are cached by content so a 4 Hz poll only uploads a
 * picture when the face actually changed.
 */
"use strict";

const SIZE = 144;
const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
/** The width text may use inside a tile, in pixels. */
const TEXT_WIDTH = 124;

const TONES = {
	idle: { background: "#1e293b", accent: "#64748b", text: "#e2e8f0" },
	live: { background: "#0f172a", accent: "#38bdf8", text: "#f8fafc" },
	on: { background: "#052e16", accent: "#22c55e", text: "#f0fdf4" },
	off: { background: "#1f2937", accent: "#475569", text: "#cbd5e1" },
	warn: { background: "#3b1d02", accent: "#f59e0b", text: "#fffbeb" },
	error: { background: "#450a0a", accent: "#ef4444", text: "#fef2f2" }
};

/** A rough width for a string, in multiples of the font size. */
function textWidth(text) {
	let total = 0;
	const characters = String(text === undefined || text === null ? "" : text);
	for (let i = 0; i < characters.length; i++) {
		const character = characters.charAt(i);
		if (character === " ") {
			total += 0.3;
		} else if ("0123456789".indexOf(character) >= 0) {
			total += 0.58;
		} else if (".:,°%-+".indexOf(character) >= 0) {
			total += 0.34;
		} else if (character !== character.toLowerCase() && character === character.toUpperCase()) {
			total += 0.64;
		} else {
			total += 0.52;
		}
	}
	return total || 0.52;
}

/** The largest font size that keeps the text inside the given width. */
function fitSize(text, preferred, minimum, width) {
	const byWidth = Math.floor((width || TEXT_WIDTH) / textWidth(text));
	return Math.max(minimum, Math.min(preferred, byWidth));
}

/** A font size that keeps the value inside the tile. */
function valueSize(text) {
	const length = String(text === undefined || text === null ? "" : text).length;
	let preferred;
	if (length <= 3) {
		preferred = 56;
	} else if (length <= 5) {
		preferred = 46;
	} else if (length <= 7) {
		preferred = 38;
	} else if (length <= 9) {
		preferred = 32;
	} else {
		preferred = 26;
	}
	return fitSize(text, preferred, 18);
}

function escapeXml(text) {
	return String(text)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Describe a key face.
 * @param {{label?: string, value?: string|number, unit?: string, footer?: string, tone?: string, badge?: string}} input
 */
function spec(input) {
	const source = input || {};
	const badge = source.badge ? String(source.badge).slice(0, 10) : "";
	// A badge owns the top right corner, so the label then starts at the left edge.
	const label = String(source.label || "").slice(0, badge ? 14 : 18);
	const value =
		source.value === undefined || source.value === null ? "—" : String(source.value);
	return {
		label: label,
		labelSize: fitSize(label, badge ? 15 : 17, 10, badge ? 76 : TEXT_WIDTH),
		labelAnchor: badge ? "start" : "middle",
		labelX: badge ? 14 : SIZE / 2,
		value: value,
		unit: String(source.unit || ""),
		footer: source.footer ? String(source.footer).slice(0, 22) : "",
		badge: badge,
		tone: TONES[source.tone] ? source.tone : "idle",
		valueSize: valueSize(source.value)
	};
}

function textElement(options) {
	return (
		'<text x="' + options.x + '" y="' + options.y + '" text-anchor="' +
		(options.anchor || "middle") + '"' +
		' font-family="' + FONT + '" font-size="' + options.size + '"' +
		' font-weight="' + (options.weight || 600) + '"' +
		' fill="' + options.fill + '">' + escapeXml(options.text) + "</text>"
	);
}

/** Render a description as the SVG markup for a key. */
function svg(description) {
	const tone = TONES[description.tone] || TONES.idle;
	const parts = [];
	parts.push(
		'<svg xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE +
			'" viewBox="0 0 ' + SIZE + " " + SIZE + '">'
	);
	parts.push(
		'<rect x="4" y="4" width="' + (SIZE - 8) + '" height="' + (SIZE - 8) +
			'" rx="16" fill="' + tone.background + '" stroke="' + tone.accent + '" stroke-width="3"/>'
	);

	if (description.badge) {
		parts.push('<circle cx="' + (SIZE - 26) + '" cy="26" r="15" fill="' + tone.accent + '"/>');
		parts.push(
			textElement({
				x: SIZE - 26,
				y: 31,
				size: 15,
				weight: 700,
				fill: tone.background,
				text: description.badge
			})
		);
	}

	if (description.label) {
		parts.push(
			textElement({
				x: description.labelX === undefined ? SIZE / 2 : description.labelX,
				y: 32,
				size: description.labelSize || 17,
				anchor: description.labelAnchor || "middle",
				weight: 600,
				fill: tone.accent,
				text: description.label
			})
		);
	}

	const centre = description.unit ? 74 : 80;
	parts.push(
		textElement({
			x: SIZE / 2,
			y: Math.round(centre + description.valueSize * 0.35),
			size: description.valueSize,
			weight: 700,
			fill: tone.text,
			text: description.value
		})
	);

	if (description.unit) {
		parts.push(
			textElement({
				x: SIZE / 2,
				y: Math.round(centre + description.valueSize * 0.35 + 26),
				size: 19,
				weight: 600,
				fill: tone.accent,
				text: description.unit
			})
		);
	}

	if (description.footer) {
		parts.push(
			textElement({
				x: SIZE / 2,
				y: SIZE - 16,
				size: 15,
				weight: 500,
				fill: tone.accent,
				text: description.footer
			})
		);
	}

	parts.push("</svg>");
	return parts.join("");
}

function dataUri(description) {
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg(description));
}

function signature(description) {
	return [
		description.tone,
		description.label,
		description.value,
		description.unit,
		description.footer,
		description.badge
	].join("|");
}

function createRenderer() {
	const cache = new Map();
	const last = new Map();

	return {
		/** The image for a description, or null when this context already shows it. */
		image: function (contextId, description) {
			const key = signature(description);
			if (contextId && last.get(contextId) === key) {
				return null;
			}
			if (contextId) {
				last.set(contextId, key);
			}
			if (!cache.has(key)) {
				if (cache.size > 400) {
					cache.clear();
				}
				cache.set(key, dataUri(description));
			}
			return cache.get(key);
		},
		forget: function (contextId) {
			last.delete(contextId);
		},
		clear: function () {
			cache.clear();
			last.clear();
		}
	};
}

module.exports = {
	SIZE: SIZE,
	TONES: TONES,
	spec: spec,
	svg: svg,
	dataUri: dataUri,
	signature: signature,
	valueSize: valueSize,
	fitSize: fitSize,
	textWidth: textWidth,
	createRenderer: createRenderer
};
