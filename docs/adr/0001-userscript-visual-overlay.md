# Deliver as a Userscript Visual Overlay

We chose to implement the tool as a client-side userscript (for Tampermonkey/Violentmonkey) that only renders a visual reference overlay, rather than building a standalone Chrome extension or an automated segment-editing bot.

The WME community standardizes on userscripts that hook directly into the editor's OpenLayers map canvas (`W.map`), which avoids cross-browser packaging friction and isolated-world limitations. Keeping the tool strictly visual ensures full compliance with Waze community editing policies, keeping human editors in complete control of all map changes while giving them access to official municipal signage data.
