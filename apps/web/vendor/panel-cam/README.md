# Browser panel CAM dependencies

The unmodified Pyodide 0.29.3 npm runtime is served locally alongside these wheels. Gerbonara 1.6.3 comes from [PyPI](https://pypi.org/project/gerbonara/1.6.3/). The NumPy and Shapely wheels are the builds listed in the runtime's lock file. The wheels are unmodified. The corresponding source is available from the [Pyodide 0.29.3 release](https://github.com/pyodide/pyodide/tree/0.29.3), the [Pyodide package build recipes](https://github.com/pyodide/pyodide-recipes), [Gerbonara 1.6.3](https://pypi.org/project/gerbonara/1.6.3/#files), [NumPy 2.2.5](https://github.com/numpy/numpy/tree/v2.2.5), and [Shapely 2.0.7](https://github.com/shapely/shapely/tree/2.0.7).

Shapely’s wheel contains the dynamically loaded GEOS 3.12.1 libraries. The [GEOS source archive](https://download.osgeo.org/geos/geos-3.12.1.tar.bz2) and [LGPL 2.1 text](geos-license.txt) correspond to that version. Self-hosted installations can replace the Shapely wheel with a compatible build using the same Pyodide ABI.

Gerbonara uses [Apache 2.0](gerbonara-license.txt). It also ships the KiCad stroke font as source in `gerbonara/data/newstroke_font.cpp`. That file includes the upstream copyright attribution and is covered by [GPL 2.0 or later](kicad-newstroke-license.txt).

| Wheel | SHA-256 |
| --- | --- |
| Gerbonara 1.6.3 | fccf782acdc98e80e3a418b7ed57d35c4f6ac7a8bc5e5d3ddc48bdd870919be2 |
| NumPy 2.2.5 | 6eaab6a7bb658d71ebe702911a3deab715323642462eb41b65565ca6a7cc23f1 |
| Shapely 2.0.7 | 3c14600713a254d407c92bccd2d8c679b23296ac1aacb69556cf1d5352d71f6c |
