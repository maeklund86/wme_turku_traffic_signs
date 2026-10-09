# Use Trimble OGC API Instead of Legacy WFS

We chose to fetch traffic sign data using Turku's Trimble OGC API (`/trimbleogcapi/collections/GIS:Liikennemerkit/items`) instead of the legacy Tekla WFS endpoint (`/TeklaOGCWeb/WFS.ashx`).

Although Finnish open data catalogs often list the WFS endpoint first, the WFS server only supports GML 3.1.1 XML output in the local ETRS-GK23 coordinate system. Consuming it inside a client-side userscript would require an XML parser and heavy projection transformations (`proj4js`). The Trimble OGC API natively provides GeoJSON in WGS84 (`EPSG:4326`), exactly matching the coordinates and format expected by WME and OpenLayers while keeping the script bundle lightweight and fast.
