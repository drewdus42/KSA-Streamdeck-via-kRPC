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
const COUNTER_FONT = "Consolas, 'Courier New', monospace";
/** The width text may use inside a tile, in pixels. */
const TEXT_WIDTH = 112;

const TONES = {
	idle: { background: "#252525", accent: "#a5a5a5", text: "#ededeb" },
	live: { background: "#202020", accent: "#d8d8d5", text: "#ffffff" },
	on: { background: "#24e638", accent: "#24e638", text: "#101610" },
	off: { background: "#363636", accent: "#a5a5a5", text: "#f0f0ee" },
	warn: { background: "#e6df39", accent: "#e6df39", text: "#171710" },
	error: { background: "#cf2525", accent: "#f03d3d", text: "#ffffff" }
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
			total += 0.62;
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
	return fitSize(text, preferred, 10);
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
		' font-family="' + (options.font || FONT) + '" font-size="' + options.size + '"' +
		' font-weight="' + (options.weight || 600) + '"' +
		(options.baseline ? ' dominant-baseline="' + options.baseline + '"' : "") +
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
			'" rx="18" fill="#121212" stroke="#484848" stroke-width="3"/>'
	);
	parts.push('<path d="M12 39H132" stroke="#424242" stroke-width="1"/>');
	parts.push(
		'<rect x="12" y="45" width="120" height="58" rx="6" fill="' + tone.background +
			'" stroke="#050505" stroke-width="3"/>'
	);
	parts.push('<path d="M15 48H129" stroke="#ffffff" stroke-opacity=".14" stroke-width="1"/>');
	const numeric = /^[+\-]?\d/.test(description.value);
	if (numeric) {
		const cellWidth = description.valueSize * 0.6;
		const left = (SIZE - cellWidth * description.value.length) / 2;
		for (let i = 1; i < description.value.length; i++) {
			const x = Math.round((left + cellWidth * i) * 10) / 10;
			parts.push('<path d="M' + x + ' 48V100" stroke="#ffffff" stroke-opacity=".08"/>');
		}
	}

	if (description.badge) {
		parts.push('<rect x="105" y="19" width="18" height="18" rx="2" fill="' + tone.accent + '"/>');
		parts.push(
			textElement({
				x: 114,
				y: 28,
				size: 13,
				baseline: "central",
				weight: 700,
				fill: "#121212",
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
				fill: "#e6e6e3",
				text: description.label
			})
		);
	}

	parts.push(
		textElement({
			x: SIZE / 2,
			y: numeric ? 74 : 74 - Math.round(description.valueSize * 0.05),
			size: description.valueSize,
			weight: 600,
			font: numeric ? COUNTER_FONT : FONT,
			baseline: "central",
			fill: tone.text,
			text: description.value
		})
	);

	if (description.unit) {
		parts.push(
			textElement({
				x: description.footer ? 16 : SIZE / 2,
				y: 123,
				anchor: description.footer ? "start" : "middle",
				size: fitSize(description.unit, 14, 8, description.footer ? 45 : TEXT_WIDTH),
				weight: 600,
				fill: "#e6e6e3",
				text: description.unit
			})
		);
	}

	if (description.footer) {
		parts.push(
			textElement({
				x: description.unit ? 128 : SIZE / 2,
				y: 123,
				anchor: description.unit ? "end" : "middle",
				size: fitSize(description.footer, 14, 8, description.unit ? 65 : TEXT_WIDTH),
				weight: 500,
				fill: "#c4c4c0",
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
